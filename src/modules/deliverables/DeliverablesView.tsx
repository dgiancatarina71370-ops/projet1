// Écran « Livrables » (lot M8), version d'affichage pure : elle reçoit tout par propriétés. Le conteneur (DeliverablesScreen.tsx) l’alimente.
import { NoProjectView, SelectField } from '../../shared/ui.tsx';
import { archiveNote, MODEL_OPTIONS } from './logic.ts';
import type { ModelInfo } from '../../export/deliverables/models.ts';

export { NoProjectView };

export interface DeliverablesViewProps {
  projectName: string;
  modelId: string;
  model: ModelInfo | null;
  workshopOptions: ReadonlyArray<{ value: string; label: string }>;
  workshopId: string;
  includeArchived: boolean;
  busy: boolean;
  /** Ce qui empêche de générer (vide : tout est prêt). */
  problem: string;
  /** Aperçu Markdown ; vide tant qu'il n'y a rien à montrer. */
  preview: string;
  message: { level: 'ok' | 'error'; text: string } | null;
  onModel: (v: string) => void;
  onWorkshop: (v: string) => void;
  onIncludeArchived: (v: boolean) => void;
  onSave: () => void;
  /** Document à ouvrir dans l'écran Documents après un enregistrement (ou un contenu identique) ; null : aucun. */
  savedDocumentId: number | null;
  onOpenDocument: (id: number) => void;
}

export function DeliverablesView(props: DeliverablesViewProps) {
  return (
    <div className="space-y-4 text-sm">
      <p className="text-hub-muted">
        Génère un livrable à partir des données du projet « {props.projectName} » et l'enregistre comme document en brouillon. L'export en Markdown, HTML ou Word se fait ensuite depuis l'écran Documents, à partir du contenu enregistré.
        Si le contenu est identique à la dernière version, rien n'est créé ; s'il a changé, une nouvelle version est enregistrée et la précédente devient « Remplacée ». Le texte saisi dans les fiches est repris tel quel, jamais interprété comme une mise en forme.
      </p>
      <div className="grid max-w-xl gap-3">
        <SelectField id="dl-model" label="Modèle de livrable" value={props.modelId} options={MODEL_OPTIONS} onChange={props.onModel} />
        {props.model && <p className="-mt-2 text-hub-muted">{props.model.description}</p>}
        {props.model?.needsWorkshop && <SelectField id="dl-workshop" label="Atelier" value={props.workshopId} options={props.workshopOptions} onChange={props.onWorkshop} />}
        <div>
          <label className="flex items-center gap-2">
            <input id="dl-archived" type="checkbox" checked={props.includeArchived} disabled={props.model !== null && !props.model.usesArchiveOption} onChange={(e) => props.onIncludeArchived(e.target.checked)} />
            Inclure les éléments archivés ou rejetés
          </label>
          <p className="ml-6 text-hub-muted">{archiveNote(props.model)}</p>
        </div>
      </div>
      {props.problem !== '' && <p role="status" className="text-hub-muted">{props.problem}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={props.busy || props.problem !== ''} onClick={props.onSave} className="rounded border border-hub-line px-3 py-1 disabled:opacity-50">
          Enregistrer comme document
        </button>
        {props.savedDocumentId !== null && (
          <button type="button" onClick={() => props.onOpenDocument(props.savedDocumentId as number)} className="rounded border border-hub-line px-3 py-1">
            Ouvrir dans Documents
          </button>
        )}
      </div>
      {props.message && (
        <p role={props.message.level === 'error' ? 'alert' : 'status'} className={`break-all ${props.message.level === 'error' ? 'text-hub-bad' : 'text-hub-ok'}`}>{props.message.text}</p>
      )}
      {props.preview !== '' && (
        <div className="space-y-1">
          <h3 className="font-semibold">Aperçu (Markdown généré)</h3>
          <p className="text-hub-muted">Ce texte est celui qui sera enregistré. Les fichiers HTML et Word en sont tirés à l'export, avec la signature de l'application.</p>
          <pre aria-label="Aperçu du livrable" className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border border-hub-line p-3 font-mono text-xs">{props.preview}</pre>
        </div>
      )}
    </div>
  );
}
