// Écriture d'un fichier d'export par le noyau (lot V2.3a). Point d'accès unique : les couches supérieures ne touchent pas au pilote.
import { rawDriver } from './internal.ts';
import type { SavedExport } from './driver.ts';

export type { SavedExport };

/** Dossier exports/ de BAMentorData sans jamais écraser (askWhere faux), ou « Enregistrer sous… » (null si annulé). */
export function saveExportFile(fileName: string, bytes: Uint8Array, askWhere: boolean): Promise<SavedExport | null> {
  return rawDriver().exportSave(fileName, bytes, askWhere);
}
