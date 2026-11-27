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
import { mentionLine, seriesKey, serializeOptions, serializeSnapshot, versionedTitle, withMention } from '../domain/documents.ts';
import { truncateBytes } from './filename.ts';

export interface ExportOptions {
  /** Version de l'application (app_info). */
  version: string;
  /** Vrai : boîte « Enregistrer sous… ». Faux : dossier exports/ de BAMentorData, sans écrasement. */
  askWhere?: boolean;
  now?: Date;
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
    ? { title: versionedTitle(truncateBytes(doc.name, 90), doc.version), markdown: withMention(doc.content, mentionLine(doc.version, doc.status, doc.replaced_by_version)) }
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
