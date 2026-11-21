// Export d'un livrable vers un fichier (lot V2.3a) : lecture du livrable → pipeline (signature) → écriture par le noyau.
// Aucune écriture en base : un export ne modifie aucune donnée, donc ne laisse pas de ligne au journal.
import { getDocumentContent } from '../data/repositories/documents.ts';
import { saveExportFile } from '../data/export-files.ts';
import type { SavedExport } from '../data/export-files.ts';
import { exportDocument } from './pipeline.ts';
import type { ExportFormat } from './pipeline.ts';

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
