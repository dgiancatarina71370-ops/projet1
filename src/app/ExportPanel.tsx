import { useEffect, useState } from 'react';
import { listDocuments } from '../data/repositories/documents.ts';
import type { DocumentSummary } from '../data/repositories/documents.ts';
import { exportDocumentToFile } from '../export/service.ts';
import { FORMATS } from '../export/pipeline.ts';
import type { ExportFormat } from '../export/pipeline.ts';
import { formatBytes } from '../shared/format.ts';

const STATUS: Record<string, string> = { draft: 'brouillon', validated: 'validé', archived: 'archivé' };
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

interface Message {
  level: 'ok' | 'error';
  text: string;
}

/**
 * Carte d'export technique (lot V2.3a), en attendant l'écran Documents (lot V2.7) : liste les livrables de la base et les exporte
 * en Markdown, HTML ou Word, signés. `refreshKey` : change après un import ou une écriture pour relire la liste.
 */
export function ExportPanel(props: { version: string; refreshKey: string }) {
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [askWhere, setAskWhere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    let dead = false;
    listDocuments()
      .then((d) => !dead && setDocs(d))
      .catch((e) => !dead && setMessage({ level: 'error', text: errorText(e) }));
    return () => {
      dead = true;
    };
  }, [props.refreshKey]);

  const run = async (doc: DocumentSummary, format: ExportFormat) => {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await exportDocumentToFile(doc.id, format, { version: props.version, askWhere });
      if (saved) setMessage({ level: 'ok', text: `Export ${FORMATS[format].label} créé : ${saved.name} (${formatBytes(saved.sizeBytes)}). Emplacement : ${saved.path}` });
    } catch (e) {
      setMessage({ level: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="text-hub-muted">
        Exporte un livrable en Markdown, en HTML ou en Word (.docx). La signature (nom, auteur, version, date de génération) est ajoutée automatiquement ; un export sans signature est refusé. Le HTML saisi dans un livrable n’est jamais interprété.
        Par défaut, le fichier est écrit dans le dossier <span className="font-mono">exports</span> de BAMentorData, sans jamais écraser un export existant. Les exports ne font pas partie des sauvegardes : ils se régénèrent depuis la base.
      </p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={askWhere} onChange={(e) => setAskWhere(e.target.checked)} />
        Choisir l’emplacement (« Enregistrer sous… »)
      </label>
      {docs !== null && docs.length === 0 && <p className="text-hub-muted">Aucun livrable dans la base. Importez un export V1 pour en obtenir.</p>}
      <ul className="space-y-2">
        {(docs ?? []).map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-hub-line px-3 py-2">
            <div className="min-w-0">
              <div className="break-words">#{d.id} · {d.name}</div>
              <div className="text-xs text-hub-muted">{d.projectName} · {d.kind} · {STATUS[d.status] ?? d.status}</div>
            </div>
            <div className="flex gap-2">
              {(Object.keys(FORMATS) as ExportFormat[]).map((f) => (
                <button key={f} type="button" disabled={busy} onClick={() => run(d, f)} className="rounded border border-hub-line px-3 py-1 disabled:opacity-50">
                  {FORMATS[f].label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {message && (
        <p role={message.level === 'error' ? 'alert' : 'status'} className={`break-all ${message.level === 'error' ? 'text-hub-bad' : 'text-hub-ok'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
