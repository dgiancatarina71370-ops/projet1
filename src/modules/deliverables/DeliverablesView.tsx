// Écran « Livrables » (lot M8), version d'affichage pure : elle reçoit tout par propriétés. Le conteneur (DeliverablesScreen.tsx) l’alimente.
import { NoProjectView, SelectField } from '../../shared/ui.tsx';
import { FORMATS } from '../../export/pipeline.ts';
import type { ExportFormat } from '../../export/pipeline.ts';
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
  askWhere: boolean;
  busy: boolean;
  /** Ce qui empêche de générer (vide : tout est prêt). */
  problem: string;
  /** Aperçu Markdown ; vide tant qu'il n'y a rien à montrer. */
  preview: string;
  message: { level: 'ok' | 'error'; text: string } | null;
  onModel: (v: string) => void;
  onWorkshop: (v: string) => void;
  onIncludeArchived: (v: boolean) => void;
  onAskWhere: (v: boolean) => void;
  onExport: (format: ExportFormat) => void;
}

export function DeliverablesView(props: DeliverablesViewProps) {
  const formats = Object.keys(FORMATS) as ExportFormat[];
  return (
    <div className="space-y-4 text-sm">
      <p className="text-hub-muted">
        Génère un livrable à partir des données du projet « {props.projectName} » et l'exporte en Markdown, HTML ou Word, avec la signature de l'application.
        Rien n'est enregistré dans la base : le livrable se régénère à chaque export. Le texte saisi dans les fiches est repris tel quel, jamais interprété comme une mise en forme.
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
        <label className="flex items-center gap-2">
          <input id="dl-ask" type="checkbox" checked={props.askWhere} onChange={(e) => props.onAskWhere(e.target.checked)} />
          Choisir l'emplacement (« Enregistrer sous… »)
        </label>
        <p className="text-hub-muted">
          Par défaut, le fichier est écrit dans le dossier <span className="font-mono">exports</span> de BAMentorData, sans jamais écraser un export existant. Les exports ne font pas partie des sauvegardes.
        </p>
      </div>
      {props.problem !== '' && <p role="status" className="text-hub-muted">{props.problem}</p>}
      <div className="flex flex-wrap gap-2">
        {formats.map((f) => (
          <button key={f} type="button" disabled={props.busy || props.problem !== ''} onClick={() => props.onExport(f)} className="rounded border border-hub-line px-3 py-1 disabled:opacity-50">
            Exporter en {FORMATS[f].label}
          </button>
        ))}
      </div>
      {props.message && (
        <p role={props.message.level === 'error' ? 'alert' : 'status'} className={`break-all ${props.message.level === 'error' ? 'text-hub-bad' : 'text-hub-ok'}`}>{props.message.text}</p>
      )}
      {props.preview !== '' && (
        <div className="space-y-1">
          <h3 className="font-semibold">Aperçu (Markdown généré)</h3>
          <p className="text-hub-muted">Les fichiers HTML et Word sont mis en forme à partir de ce texte. La signature est ajoutée à l'export.</p>
          <pre aria-label="Aperçu du livrable" className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border border-hub-line p-3 font-mono text-xs">{props.preview}</pre>
        </div>
      )}
    </div>
  );
}
