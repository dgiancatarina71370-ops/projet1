// Écran « Documents » (lot F5), version d'affichage pure : elle reçoit tout par propriétés. Le conteneur (DocumentsScreen.tsx) l'alimente.
// Les boutons d'export et de comparaison ne modifient aucune donnée (D96) ; seuls Valider, Archiver et Désarchiver écrivent (lot F6), jamais le contenu.
import { Card, NoProjectView } from '../../shared/ui.tsx';
import { FORMATS } from '../../export/pipeline.ts';
import type { ExportFormat } from '../../export/pipeline.ts';
import { emptyDocumentsText, MAX_COMMENT_HINT } from './logic.ts';
import type { ComparisonView, DocumentDetailView, DocumentLine } from './logic.ts';

export { NoProjectView };

export interface DocumentsViewProps {
  projectName: string;
  lines: DocumentLine[];
  /** Documents du projet, tous états confondus (pour le message d'une liste vide). */
  total: number;
  replacedCount: number;
  showReplaced: boolean;
  archivedCount: number;
  showArchived: boolean;
  selectedId: number | null;
  detail: DocumentDetailView | null;
  /** Texte brut du contenu stocké. Jamais interprété. */
  preview: string;
  askWhere: boolean;
  busy: boolean;
  message: { level: 'ok' | 'error'; text: string } | null;
  /** Cadre de validation ouvert (F6-D01) et commentaire en cours de saisie. */
  validating: boolean;
  comment: string;
  /** Résultat de la comparaison : une comparaison, un texte « impossible », ou rien tant qu'elle n'est pas demandée. */
  comparison: { view: ComparisonView } | { unavailable: string } | null;
  onShowReplaced: (v: boolean) => void;
  onShowArchived: (v: boolean) => void;
  onStartValidate: () => void;
  onCancelValidate: () => void;
  onComment: (v: string) => void;
  onConfirmValidate: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onCompare: () => void;
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
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1">
          <label className="flex items-center gap-2">
            <input id="doc-replaced" type="checkbox" checked={props.showReplaced} onChange={(e) => props.onShowReplaced(e.target.checked)} />
            Afficher les versions remplacées ({props.replacedCount})
          </label>
          <label className="flex items-center gap-2">
            <input id="doc-archived" type="checkbox" checked={props.showArchived} onChange={(e) => props.onShowArchived(e.target.checked)} />
            Afficher les archivés ({props.archivedCount})
          </label>
        </div>
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
            <div className="flex flex-wrap gap-2">
              {props.detail.actions.includes('validate') && (
                <button type="button" disabled={props.busy || props.validating} onClick={props.onStartValidate} className="rounded border border-hub-line px-3 py-1 disabled:opacity-50">Valider</button>
              )}
              {props.detail.actions.includes('archive') && (
                <button type="button" disabled={props.busy} onClick={props.onArchive} className="rounded border border-hub-line px-3 py-1 disabled:opacity-50">Archiver</button>
              )}
              {props.detail.actions.includes('unarchive') && (
                <button type="button" disabled={props.busy} onClick={props.onUnarchive} className="rounded border border-hub-line px-3 py-1 disabled:opacity-50">Désarchiver</button>
              )}
              {props.detail.canCompare && (
                <button type="button" disabled={props.busy} onClick={props.onCompare} className="rounded border border-hub-line px-3 py-1 disabled:opacity-50">Comparer avec l’état courant</button>
              )}
            </div>
            {props.validating && props.detail.actions.includes('validate') && (
              <div className="space-y-2 rounded border border-hub-line p-3">
                <p className="text-hub-muted">Une validation ne s’annule pas : pour corriger un document validé, enregistrez une nouvelle version depuis Livrables.</p>
                <label className="block">
                  {MAX_COMMENT_HINT}
                  <textarea aria-label="Commentaire de validation" maxLength={500} rows={3} value={props.comment} onChange={(e) => props.onComment(e.target.value)} className="mt-1 w-full rounded border border-hub-line bg-hub-bg p-2" />
                </label>
                <div className="flex gap-2">
                  <button type="button" disabled={props.busy} onClick={props.onConfirmValidate} className="rounded border border-hub-line px-3 py-1 disabled:opacity-50">Confirmer la validation</button>
                  <button type="button" disabled={props.busy} onClick={props.onCancelValidate} className="rounded border border-hub-line px-3 py-1 disabled:opacity-50">Annuler</button>
                </div>
              </div>
            )}
          </div>

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

          {props.comparison !== null && (
            <div className="mb-3 space-y-2" aria-label="Comparaison avec l’état courant">
              <h4 className="font-semibold">Comparaison avec l’état courant</h4>
              {'unavailable' in props.comparison ? (
                <p className="text-hub-muted">{props.comparison.unavailable}</p>
              ) : (
                <>
                  <p>{props.comparison.view.summary}</p>
                  {props.comparison.view.groups.map((g) => (
                    <div key={g.title} className="overflow-x-auto">
                      <h5 className="mb-1 text-hub-muted">{g.title}</h5>
                      <table className="w-full text-left">
                        <thead className="text-hub-muted"><tr>{g.headers.map((h) => <th key={h} className="py-1 pr-3">{h}</th>)}</tr></thead>
                        <tbody>
                          {g.rows.map((r) => (
                            <tr key={r.join('|')} className="border-t border-hub-line align-top">{r.map((c, i) => <td key={i} className="py-1 pr-3">{c}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                  <p className="text-hub-muted">{props.comparison.view.note}</p>
                </>
              )}
            </div>
          )}

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
