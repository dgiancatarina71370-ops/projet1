// Écran « Documents » (lot F5), version d'affichage pure : elle reçoit tout par propriétés. Le conteneur (DocumentsScreen.tsx) l'alimente.
// Les boutons d'export ne modifient aucune donnée (D96) ; aucun bouton ne modifie ni ne supprime un document.
import { Card, NoProjectView } from '../../shared/ui.tsx';
import { FORMATS } from '../../export/pipeline.ts';
import type { ExportFormat } from '../../export/pipeline.ts';
import { emptyDocumentsText } from './logic.ts';
import type { DocumentDetailView, DocumentLine } from './logic.ts';

export { NoProjectView };

export interface DocumentsViewProps {
  projectName: string;
  lines: DocumentLine[];
  /** Documents du projet, tous états confondus (pour le message d'une liste vide). */
  total: number;
  replacedCount: number;
  showReplaced: boolean;
  selectedId: number | null;
  detail: DocumentDetailView | null;
  /** Texte brut du contenu stocké. Jamais interprété. */
  preview: string;
  askWhere: boolean;
  busy: boolean;
  message: { level: 'ok' | 'error'; text: string } | null;
  onShowReplaced: (v: boolean) => void;
  onSelect: (id: number) => void;
  onAskWhere: (v: boolean) => void;
  onExport: (format: ExportFormat) => void;
}

export function DocumentsView(props: DocumentsViewProps) {
  const formats = Object.keys(FORMATS) as ExportFormat[];
  return (
    <div className="space-y-4 text-sm">
      <p className="text-hub-muted">Projet : <span className="text-hub-fg">{props.projectName}</span></p>
      <Card title="Documents">
        <p className="mb-3 text-hub-muted">
          Un document est une photographie datée d’un livrable : son contenu ne change plus, même si les fiches évoluent ensuite. Enregistrez un livrable depuis l’écran Livrables ; un nouvel enregistrement dont le contenu a changé crée la version suivante et la précédente devient « Remplacée ».
        </p>
        <label className="mb-3 flex items-center gap-2">
          <input id="doc-replaced" type="checkbox" checked={props.showReplaced} onChange={(e) => props.onShowReplaced(e.target.checked)} />
          Afficher les versions remplacées ({props.replacedCount})
        </label>
        {props.lines.length === 0 ? (
          <p className="text-hub-muted">{emptyDocumentsText(props.total)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-hub-muted">
                <tr><th className="py-1 pr-3">Nom</th><th className="pr-3">Version</th><th className="pr-3">État</th><th className="pr-3">Origine</th><th>Date</th></tr>
              </thead>
              <tbody>
                {props.lines.map((l) => (
                  <tr key={l.id} className={`border-t border-hub-line align-top ${props.selectedId === l.id ? 'bg-hub-bg' : ''}`}>
                    <td className="py-1 pr-3">
                      <button type="button" aria-pressed={props.selectedId === l.id} className="text-left text-hub-accent underline" onClick={() => props.onSelect(l.id)}>{l.name}</button>
                    </td>
                    <td className="pr-3">{l.version}</td>
                    <td className="pr-3">{l.state}</td>
                    <td className="pr-3">{l.origin}</td>
                    <td className="whitespace-nowrap text-hub-muted">{l.when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {props.detail !== null && (
        <Card title="Détail du document">
          <h3 className="mb-2 break-words font-semibold">{props.detail.title}</h3>
          <dl className="mb-3 grid grid-cols-[10rem_1fr] gap-y-1">
            {props.detail.facts.map((f) => (
              <div key={f.label} className="contents"><dt className="text-hub-muted">{f.label}</dt><dd>{f.value}</dd></div>
            ))}
          </dl>

          <div className="mb-3 space-y-2">
            <label className="flex items-center gap-2">
              <input id="doc-ask" type="checkbox" checked={props.askWhere} onChange={(e) => props.onAskWhere(e.target.checked)} />
              Choisir l’emplacement (« Enregistrer sous… »)
            </label>
            <p className="text-hub-muted">
              Par défaut, le fichier est écrit dans le dossier <span className="font-mono">exports</span> de BAMentorData, sans jamais écraser un export existant. L’export part du contenu figé de ce document, avec la signature de l’application ; un document généré porte aussi sa version et son statut sous le titre. Les exports ne font pas partie des sauvegardes.
            </p>
            <div className="flex flex-wrap gap-2">
              {formats.map((f) => (
                <button key={f} type="button" disabled={props.busy} onClick={() => props.onExport(f)} className="rounded border border-hub-line px-3 py-1 disabled:opacity-50">
                  Exporter en {FORMATS[f].label}
                </button>
              ))}
            </div>
            {props.message && (
              <p role={props.message.level === 'error' ? 'alert' : 'status'} className={`break-all ${props.message.level === 'error' ? 'text-hub-bad' : 'text-hub-ok'}`}>{props.message.text}</p>
            )}
          </div>

          <h4 className="mb-1 font-semibold">Éléments figés</h4>
          {props.detail.items === null ? (
            <p className="mb-3 text-hub-muted">{props.detail.noItemsText}</p>
          ) : props.detail.items.length === 0 ? (
            <p className="mb-3 text-hub-muted">Ce document ne présentait aucun élément.</p>
          ) : (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-hub-muted"><tr><th className="py-1 pr-3">Code</th><th className="pr-3">Titre</th><th>Statut à la génération</th></tr></thead>
                <tbody>
                  {props.detail.items.map((i) => (
                    <tr key={`${i.code}-${i.title}`} className="border-t border-hub-line align-top"><td className="whitespace-nowrap py-1 pr-3">{i.code}</td><td className="pr-3">{i.title}</td><td className="text-hub-muted">{i.status}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h4 className="mb-1 font-semibold">Aperçu du contenu figé</h4>
          <pre aria-label="Aperçu du document" className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border border-hub-line p-3 font-mono text-xs">{props.preview}</pre>
        </Card>
      )}
    </div>
  );
}
