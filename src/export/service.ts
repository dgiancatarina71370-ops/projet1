// Export d'un livrable vers un fichier (lot V2.3a) : lecture du livrable → pipeline (signature) → écriture par le noyau.
// Aucune écriture en base : un export ne modifie aucune donnée, donc ne laisse pas de ligne au journal.
import { getDocumentContent } from '../data/repositories/documents.ts';
import { saveExportFile } from '../data/export-files.ts';
import type { SavedExport } from '../data/export-files.ts';
import { loadProjectData } from '../data/repositories/project-export.ts';
import { exportDocument } from './pipeline.ts';
import type { ExportFormat } from './pipeline.ts';
import { generateDeliverable, modelInfo } from './deliverables/models.ts';
import type { DeliverableOptions } from './deliverables/models.ts';

export interface ExportOptions {
  /** Version de l'application (app_info). */
  version: string;
  /** Vrai : boîte « Enregistrer sous… ». Faux : dossier exports/ de BAMentorData, sans écrasement. */
  askWhere?: boolean;
  now?: Date;
}

/** Retourne le fichier écrit, ou null si l'utilisateur a annulé la boîte « Enregistrer sous ». */
export async function exportDocumentToFile(documentId: number, format: ExportFormat, options: ExportOptions): Promise<SavedExport | null> {
  const doc = await getDocumentContent(documentId);
  if (!doc) throw new Error(`Livrable introuvable (n°${documentId}).`);
  const result = await exportDocument({ title: doc.name, markdown: doc.content }, format, { version: options.version, now: options.now });
  return saveExportFile(result.fileName, result.bytes, options.askWhere === true);
}

/**
 * Livrable généré à partir des données du projet (lot M8) : lecture seule, génération, pipeline (signature), écriture par le noyau.
 * Aucune écriture en base ni au journal (D96). Retourne null si l'utilisateur a annulé la boîte « Enregistrer sous ».
 */
export async function exportGeneratedToFile(projectId: number, modelId: string, format: ExportFormat, options: ExportOptions & DeliverableOptions): Promise<SavedExport | null> {
  const model = modelInfo(modelId);
  if (!model) throw new Error(`Modèle de livrable inconnu : ${modelId}.`);
  const data = await loadProjectData(projectId);
  if (!data) throw new Error(`Projet introuvable (n°${projectId}).`);
  const doc = generateDeliverable(model.id, data, { includeArchived: options.includeArchived, workshopId: options.workshopId });
  const result = await exportDocument({ title: doc.title, markdown: doc.markdown }, format, { version: options.version, now: options.now });
  return saveExportFile(result.fileName, result.bytes, options.askWhere === true);
}
