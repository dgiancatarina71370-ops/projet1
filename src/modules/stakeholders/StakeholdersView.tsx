// Écrans « Parties prenantes » (lot M3a), versions d'affichage pures : elles reçoivent tout par propriétés et ne touchent ni la base ni l'état.
// Le conteneur (StakeholdersScreen.tsx) les alimente. Cette séparation permet de tester leur rendu sans interface réelle.
import { BUTTON_PRIMARY, BUTTON_SECONDARY, ConfirmBar, FormButtons, ItemActionBar, SelectField, StatusFilterBar, TextAreaField, TextField } from '../../shared/ui.tsx';
import { levelLabel, statusLabel } from '../../domain/stakeholders.ts';
import { emptyListMessage, LEVEL_OPTIONS, STATUS_FILTERS } from './logic.ts';
import type { FormErrors, FormValues, StatusFilter } from './logic.ts';

export interface StakeholderRow {
  id: number;
  code: string;
  title: string;
  description: string;
  status: string;
  organisation: string;
  role: string;
  influence: string;
  interest: string;
}

export function NoProjectView(props: { onGoToProjects: () => void }) {
  return (
    <div className="space-y-2 text-sm">
      <p>Aucun projet actif. Les parties prenantes appartiennent à un projet : créez-en un, ou choisissez-en un dans la liste en haut de l'écran.</p>
      <button type="button" className={BUTTON_PRIMARY} onClick={props.onGoToProjects}>Aller aux projets</button>
    </div>
  );
}

export function StakeholderListView(props: {
  projectName: string;
  rows: StakeholderRow[];
  total: number;
  filter: StatusFilter;
  onFilter: (f: StatusFilter) => void;
  onNew: () => void;
  onOpen: (id: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-hub-muted">Projet : <span className="text-hub-fg">{props.projectName}</span> · {props.total} partie{props.total > 1 ? 's' : ''} prenante{props.total > 1 ? 's' : ''}</p>
        <button type="button" className={BUTTON_PRIMARY} onClick={props.onNew}>Nouvelle partie prenante</button>
      </div>
      <StatusFilterBar options={STATUS_FILTERS} value={props.filter} onChange={(v) => props.onFilter(v as StatusFilter)} />
      {props.rows.length === 0 ? (
        <p className="text-sm text-hub-muted">{emptyListMessage(props.total, props.filter)}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-hub-muted">
            <tr><th className="py-1 pr-3">Code</th><th className="pr-3">Nom</th><th className="pr-3">Organisation</th><th className="pr-3">Rôle</th><th className="pr-3">Influence</th><th className="pr-3">Intérêt</th><th>Statut</th></tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.id} className="border-t border-hub-line">
                <td className="py-1 pr-3 whitespace-nowrap">{r.code}</td>
                <td className="pr-3"><button type="button" className="text-left text-hub-accent underline" onClick={() => props.onOpen(r.id)}>{r.title}</button></td>
                <td className="pr-3">{r.organisation}</td>
                <td className="pr-3">{r.role}</td>
                <td className="pr-3">{levelLabel(r.influence)}</td>
                <td className="pr-3">{levelLabel(r.interest)}</td>
                <td>{statusLabel(r.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function StakeholderDetailView(props: {
  row: StakeholderRow;
  busy: boolean;
  error: string;
  confirmDelete: string | null;
  onEdit: () => void;
  onToggleArchive: () => void;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onBack: () => void;
}) {
  const r = props.row;
  const archived = r.status === 'archived';
  return (
    <div className="space-y-3">
      <button type="button" className="text-sm text-hub-accent underline" onClick={props.onBack}>← Retour à la liste</button>
      <h3 className="text-lg font-semibold">{r.code} · {r.title}</h3>
      <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
        <dt className="text-hub-muted">Statut</dt><dd>{statusLabel(r.status)}</dd>
        <dt className="text-hub-muted">Organisation</dt><dd>{r.organisation || '—'}</dd>
        <dt className="text-hub-muted">Rôle</dt><dd>{r.role || '—'}</dd>
        <dt className="text-hub-muted">Influence</dt><dd>{levelLabel(r.influence)}</dd>
        <dt className="text-hub-muted">Intérêt</dt><dd>{levelLabel(r.interest)}</dd>
        <dt className="text-hub-muted">Description</dt><dd className="whitespace-pre-wrap">{r.description || '—'}</dd>
      </dl>
      {props.error && <p role="alert" className="text-sm text-hub-bad">{props.error}</p>}
      {props.confirmDelete !== null ? (
        <ConfirmBar message={props.confirmDelete} confirmLabel="Supprimer définitivement" busy={props.busy} onConfirm={props.onConfirmDelete} onCancel={props.onCancelDelete} />
      ) : (
        <ItemActionBar busy={props.busy} onEdit={props.onEdit} onAskDelete={props.onAskDelete}>
          <button type="button" className={BUTTON_SECONDARY} disabled={props.busy} onClick={props.onToggleArchive}>{archived ? 'Réactiver' : 'Archiver'}</button>
        </ItemActionBar>
      )}
    </div>
  );
}

export function StakeholderFormView(props: {
  heading: string;
  values: FormValues;
  errors: FormErrors;
  busy: boolean;
  error: string;
  onChange: (key: keyof FormValues, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  /** Vrai quand l'utilisateur a demandé à quitter avec une saisie non enregistrée : la confirmation remplace les boutons. */
  askAbandon: boolean;
  onConfirmAbandon: () => void;
  onKeepEditing: () => void;
}) {
  const v = props.values;
  return (
    <form className="max-w-xl space-y-3" onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
      <h3 className="text-lg font-semibold">{props.heading}</h3>
      <TextField id="sh-title" label="Nom" hint="Obligatoire, 200 caractères au plus." value={v.title} error={props.errors.title} onChange={(x) => props.onChange('title', x)} />
      <TextField id="sh-organisation" label="Organisation" value={v.organisation} error={props.errors.organisation} onChange={(x) => props.onChange('organisation', x)} />
      <TextField id="sh-role" label="Rôle dans le projet" value={v.role} error={props.errors.role} onChange={(x) => props.onChange('role', x)} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField id="sh-influence" label="Influence" value={v.influence} options={LEVEL_OPTIONS} error={props.errors.influence} onChange={(x) => props.onChange('influence', x)} />
        <SelectField id="sh-interest" label="Intérêt" value={v.interest} options={LEVEL_OPTIONS} error={props.errors.interest} onChange={(x) => props.onChange('interest', x)} />
      </div>
      <TextAreaField id="sh-description" label="Description" value={v.description} error={props.errors.description} onChange={(x) => props.onChange('description', x)} />
      {props.error && <p role="alert" className="text-sm text-hub-bad">{props.error}</p>}
      <FormButtons busy={props.busy} askAbandon={props.askAbandon} onCancel={props.onCancel} onConfirmAbandon={props.onConfirmAbandon} onKeepEditing={props.onKeepEditing} />
    </form>
  );
}
