// Export et enregistrement des livrables (lots V2.3a, M8 puis F5).
// F5 (décisions F5-D05, F5-D08, F5-D09, F5-D10) : un livrable se génère et s'ENREGISTRE comme document figé ; un fichier ne part
// jamais que d'un document enregistré (instantané), jamais des données courantes. Un export ne modifie aucune donnée (D96) :
// il ne laisse pas de ligne au journal. L'enregistrement d'un document, lui, est une écriture journalisée.
import { getDocument, saveGeneratedDocument } from '../data/repositories/documents.ts';
import type { SaveOutcome } from '../data/repositories/documents.ts';
import { saveExportFile } from '../data/export-files.ts';
import type { SavedExport } from '../data/export-files.ts';
import { loadProjectData } from '../data/repositories/project-export.ts';
import { exportDocument } from './pipeline.ts';
import type { ExportFormat } from './pipeline.ts';
import { deliverableItems, generateDeliverable, modelInfo } from './deliverables/models.ts';
import type { DeliverableOptions } from './deliverables/models.ts';
import { compareSnapshots, mentionLine, modelOfSeries, parseOptions, parseSnapshot, seriesKey, serializeOptions, serializeSnapshot, versionedTitle, withMention } from '../domain/documents.ts';
import type { Comparison } from '../domain/documents.ts';
import { truncateBytes } from './filename.ts';
import { formatLocal } from '../shared/format.ts';

export interface ExportOptions {
  /** Version de l'application (app_info). */
  version: string;
  /** Vrai : boîte « Enregistrer sous… ». Faux : dossier exports/ de BAMentorData, sans écrasement. */
  askWhere?: boolean;
  now?: Date;
}

/** Date de validation JJ/MM/AAAA (heure locale) pour la mention d'export (F6-D10) ; null si absente ou illisible. */
function validationDate(validatedAt: string | null): string | null {
  if (validatedAt === null) return null;
  const ms = Date.parse(validatedAt);
  return Number.isFinite(ms) ? formatLocal(ms).slice(0, 10) : null;
}

/**
 * Retourne le fichier écrit, ou null si l'utilisateur a annulé la boîte « Enregistrer sous ».
 * Un document généré porte, sous son titre, une ligne « Document : version N, statut » (F5-D08) et sa version dans le nom du fichier ;
 * un document importé de la V1 s'exporte tel quel. Le contenu stocké n'est jamais modifié.
 */
export async function exportDocumentToFile(documentId: number, format: ExportFormat, options: ExportOptions): Promise<SavedExport | null> {
  const doc = await getDocument(documentId);
  if (!doc) throw new Error(`Livrable introuvable (n°${documentId}).`);
  const generated = doc.series_key !== null;
  const source = generated
    ? { title: versionedTitle(truncateBytes(doc.name, 90), doc.version), markdown: withMention(doc.content, mentionLine(doc.version, doc.status, doc.replaced_by_version, validationDate(doc.validated_at))) }
    : { title: doc.name, markdown: doc.content };
  const result = await exportDocument(source, format, { version: options.version, now: options.now });
  return saveExportFile(result.fileName, result.bytes, options.askWhere === true);
}

/**
 * Génère un livrable à partir des données du projet et l'enregistre comme document en brouillon (F5-D05, F5-D06).
 * Contenu identique à la dernière version de la série : rien n'est écrit. Sinon : version suivante, la précédente devient « Remplacée ».
 */
export async function saveDeliverable(projectId: number, modelId: string, options: DeliverableOptions): Promise<SaveOutcome & { name: string }> {
  const model = modelInfo(modelId);
  if (!model) throw new Error(`Modèle de livrable inconnu : ${modelId}.`);
  const data = await loadProjectData(projectId);
  if (!data) throw new Error(`Projet introuvable (n°${projectId}).`);
  const workshopId = model.needsWorkshop ? options.workshopId ?? null : null;
  const opts: DeliverableOptions = { includeArchived: options.includeArchived, workshopId };
  const doc = generateDeliverable(model.id, data, opts);
  const items = deliverableItems(model.id, data, opts);
  const saved = await saveGeneratedDocument({
    projectId,
    seriesKey: seriesKey(model.id, workshopId),
    modelId: model.id,
    name: doc.title,
    content: doc.markdown,
    optionsJson: serializeOptions({ includeArchived: opts.includeArchived, workshopId }),
    itemsSnapshot: serializeSnapshot(items),
  });
  return { ...saved, name: doc.title };
}


export type ComparisonResult = { available: true; comparison: Comparison } | { available: false; reason: string };

/**
 * Compare la liste figée d'un document généré aux éléments courants du même périmètre (F6-D06, D07).
 * Lecture seule : aucune écriture, aucune ligne de journal. Le périmètre est recalculé avec le modèle, l'atelier et les options du document.
 */
export async function compareDocumentWithCurrent(documentId: number): Promise<ComparisonResult> {
  const doc = await getDocument(documentId);
  if (!doc) throw new Error(`Document introuvable (n°${documentId}).`);
  if (doc.series_key === null) return { available: false, reason: 'Ce document a été importé de la V1 : il n’a pas de liste figée, la comparaison est impossible.' };
  const frozen = parseSnapshot(doc.items_snapshot);
  if (frozen === null) return { available: false, reason: 'La liste figée de ce document est absente ou illisible : la comparaison est impossible.' };
  const options = parseOptions(doc.options_json);
  const model = modelInfo(modelOfSeries(doc.series_key));
  if (options === null || !model) return { available: false, reason: 'Les options de ce document ne sont pas enregistrées : la comparaison est impossible.' };
  const data = await loadProjectData(doc.project_id);
  if (!data) throw new Error(`Projet introuvable (n°${doc.project_id}).`);
  try {
    const current = deliverableItems(model.id, data, { includeArchived: options.includeArchived, workshopId: model.needsWorkshop ? options.workshopId : null });
    return { available: true, comparison: compareSnapshots(frozen, current) };
  } catch (e) {
    return { available: false, reason: `${e instanceof Error ? e.message : String(e)} La comparaison est impossible.` };
  }
}
