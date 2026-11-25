// Écrans « Parties prenantes » (lot M3a), versions d'affichage pures : elles reçoivent tout par propriétés et ne touchent ni la base ni l'état.
// Le conteneur (StakeholdersScreen.tsx) les alimente. Cette séparation permet de tester leur rendu sans interface réelle.
import { BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_SECONDARY, ConfirmBar, Field, INPUT_CLASS } from '../../shared/ui.tsx';
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
      <div role="group" aria-label="Filtre par statut" className="flex gap-2 text-sm">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={props.filter === f.value}
            className={`rounded border px-2 py-1 ${props.filter === f.value ? 'border-hub-accent text-hub-accent' : 'border-hub-line text-hub-muted'}`}
            onClick={() => props.onFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
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
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON_PRIMARY} disabled={props.busy} onClick={props.onEdit}>Modifier</button>
          <button type="button" className={BUTTON_SECONDARY} disabled={props.busy} onClick={props.onToggleArchive}>{archived ? 'Réactiver' : 'Archiver'}</button>
          <button type="button" className={BUTTON_DANGER} disabled={props.busy} onClick={props.onAskDelete}>Supprimer…</button>
        </div>
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
  const text = (key: keyof FormValues, label: string, hint?: string) => (
    <Field label={label} htmlFor={`sh-${key}`} error={props.errors[key]} hint={hint}>
      <input id={`sh-${key}`} className={INPUT_CLASS} value={v[key]} onChange={(e) => props.onChange(key, e.target.value)} />
    </Field>
  );
  const level = (key: 'influence' | 'interest', label: string) => (
    <Field label={label} htmlFor={`sh-${key}`} error={props.errors[key]}>
      <select id={`sh-${key}`} className={INPUT_CLASS} value={v[key]} onChange={(e) => props.onChange(key, e.target.value)}>
        {LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
  return (
    <form className="max-w-xl space-y-3" onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
      <h3 className="text-lg font-semibold">{props.heading}</h3>
      {text('title', 'Nom', 'Obligatoire, 200 caractères au plus.')}
      {text('organisation', 'Organisation')}
      {text('role', 'Rôle dans le projet')}
      <div className="grid grid-cols-2 gap-3">
        {level('influence', 'Influence')}
        {level('interest', 'Intérêt')}
      </div>
      <Field label="Description" htmlFor="sh-description" error={props.errors.description}>
        <textarea id="sh-description" rows={4} className={INPUT_CLASS} value={v.description} onChange={(e) => props.onChange('description', e.target.value)} />
      </Field>
      {props.error && <p role="alert" className="text-sm text-hub-bad">{props.error}</p>}
      {props.askAbandon ? (
        <div role="alertdialog" aria-label="Confirmation" className="space-y-2 rounded border border-hub-bad px-3 py-2 text-sm">
          <div>Abandonner la saisie en cours ? Ce qui n'est pas enregistré sera perdu.</div>
          <div className="flex gap-2">
            <button type="button" className={BUTTON_DANGER} onClick={props.onConfirmAbandon}>Abandonner la saisie</button>
            <button type="button" className={BUTTON_SECONDARY} onClick={props.onKeepEditing}>Continuer à saisir</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="submit" className={BUTTON_PRIMARY} disabled={props.busy}>Enregistrer</button>
          <button type="button" className={BUTTON_SECONDARY} disabled={props.busy} onClick={props.onCancel}>Annuler</button>
        </div>
      )}
    </form>
  );
}
