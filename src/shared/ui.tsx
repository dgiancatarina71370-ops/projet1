// Éléments d'interface communs (lot M3a). Couche « shared » : elle ne dépend que de shared/ (règle R4).
import type { ReactNode } from 'react';
import { SORT_OPTIONS, isSearching, noResultText } from './register-logic.ts';
import type { SortKey } from './register-logic.ts';

export function Card(props: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-hub-line bg-hub-panel p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-hub-muted">{props.title}</h2>
      {props.children}
    </section>
  );
}

/** Libellé + champ, avec le message d'erreur du champ s'il y en a un. */
export function Field(props: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={props.htmlFor} className="block text-sm text-hub-muted">{props.label}</label>
      {props.children}
      {props.hint && !props.error && <p className="text-xs text-hub-muted">{props.hint}</p>}
      {props.error && <p role="alert" className="text-xs text-hub-bad">{props.error}</p>}
    </div>
  );
}

export const INPUT_CLASS = 'w-full rounded border border-hub-line bg-hub-bg px-2 py-1.5 text-sm text-hub-fg';
export const BUTTON_PRIMARY = 'rounded bg-hub-accent px-3 py-1.5 text-sm font-medium text-hub-bg disabled:opacity-50';
export const BUTTON_SECONDARY = 'rounded border border-hub-line px-3 py-1.5 text-sm text-hub-fg disabled:opacity-50';
export const BUTTON_DANGER = 'rounded border border-hub-bad px-3 py-1.5 text-sm text-hub-bad disabled:opacity-50';

/** Confirmation en ligne (pas de fenêtre du navigateur) : un message, un bouton de confirmation, un bouton d'abandon. */
export function ConfirmBar(props: { message: ReactNode; confirmLabel: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="alertdialog" aria-label="Confirmation" className="space-y-2 rounded border border-hub-bad px-3 py-2 text-sm">
      <div>{props.message}</div>
      <div className="flex gap-2">
        <button type="button" className={BUTTON_DANGER} disabled={props.busy} onClick={props.onConfirm}>{props.confirmLabel}</button>
        <button type="button" className={BUTTON_SECONDARY} disabled={props.busy} onClick={props.onCancel}>Annuler</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ composants communs aux registres (lot M3b, décision D44)

export function TextField(props: { id: string; label: string; value: string; error?: string; hint?: string; type?: 'text' | 'date'; onChange: (v: string) => void }) {
  return (
    <Field label={props.label} htmlFor={props.id} error={props.error} hint={props.hint}>
      <input id={props.id} type={props.type ?? 'text'} className={INPUT_CLASS} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </Field>
  );
}

export function TextAreaField(props: { id: string; label: string; value: string; rows?: number; error?: string; hint?: string; onChange: (v: string) => void }) {
  return (
    <Field label={props.label} htmlFor={props.id} error={props.error} hint={props.hint}>
      <textarea id={props.id} rows={props.rows ?? 4} className={INPUT_CLASS} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </Field>
  );
}

export function SelectField(props: { id: string; label: string; value: string; options: ReadonlyArray<{ value: string; label: string }>; error?: string; onChange: (v: string) => void }) {
  return (
    <Field label={props.label} htmlFor={props.id} error={props.error}>
      <select id={props.id} className={INPUT_CLASS} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

/** Boutons de filtre par statut. */
export function StatusFilterBar(props: { options: ReadonlyArray<{ value: string; label: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <div role="group" aria-label="Filtre par statut" className="flex flex-wrap gap-2 text-sm">
      {props.options.map((f) => (
        <button
          key={f.value}
          type="button"
          aria-pressed={props.value === f.value}
          className={`rounded border px-2 py-1 ${props.value === f.value ? 'border-hub-accent text-hub-accent' : 'border-hub-line text-hub-muted'}`}
          onClick={() => props.onChange(f.value)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/** Propriétés de recherche, de tri et de compteurs que l'écran de registre transmet à chaque liste (lot F2). */
export interface ListExtras {
  /** Nombre d'éléments par statut, calculé sur le résultat de la recherche ; « all » = tous (F2-D03). */
  counts: Record<string, number>;
  query: string;
  onQuery: (query: string) => void;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
}

/** Barre de contrôle d'une liste de registre (lot F2) : recherche, tri, puis filtre par statut avec compteurs. */
export function ListControls(props: ListExtras & { options: ReadonlyArray<{ value: string; label: string }>; filter: string; onFilter: (v: string) => void }) {
  const counted = props.options.map((o) => ({ value: o.value, label: `${o.label} (${props.counts[o.value] ?? 0})` }));
  return (
    <div className="space-y-2">
      <div role="search" className="flex flex-wrap items-end gap-3 text-sm">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <label htmlFor="register-search" className="block text-hub-muted">Rechercher</label>
          <div className="flex gap-2">
            <input
              id="register-search"
              type="text"
              autoComplete="off"
              placeholder="Code, titre ou description"
              className={INPUT_CLASS}
              value={props.query}
              onChange={(e) => props.onQuery(e.target.value)}
            />
            {props.query !== '' && (
              <button type="button" className="rounded border border-hub-line px-2 py-1 text-hub-muted" onClick={() => props.onQuery('')}>Effacer</button>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="register-sort" className="block text-hub-muted">Trier par</label>
          <select id="register-sort" className={INPUT_CLASS} value={props.sort} onChange={(e) => props.onSort(e.target.value as SortKey)}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <StatusFilterBar options={counted} value={props.filter} onChange={props.onFilter} />
    </div>
  );
}

/** Message d'une liste vide (lot F2) : si une recherche est en cours, le message de recherche sans résultat ; sinon `fallback`, le message propre au registre. */
export function EmptyListNotice(props: { query: string; total: number; filter: string; options: ReadonlyArray<{ value: string; label: string }>; fallback: string }) {
  const label = props.filter === 'all' ? null : props.options.find((o) => o.value === props.filter)?.label ?? props.filter;
  return <p className="text-sm text-hub-muted">{isSearching(props.query) ? noResultText(props.query, props.total, label) : props.fallback}</p>;
}

/** Onglets d'un écran (lot M6) : une seule vue affichée à la fois ; l'onglet courant est annoncé par aria-selected. */
export function TabBar(props: { tabs: ReadonlyArray<{ value: string; label: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-2 border-b border-hub-line text-sm">
      {props.tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={props.value === t.value}
          className={`-mb-px border-b-2 px-3 py-1.5 ${props.value === t.value ? 'border-hub-accent text-hub-accent' : 'border-transparent text-hub-muted'}`}
          onClick={() => props.onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Barre d'actions d'une fiche : Modifier, les actions propres au type (statut, archivage), Supprimer… (la confirmation est gérée par l'écran). */
export function ItemActionBar(props: { busy: boolean; onEdit: () => void; onAskDelete: () => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={BUTTON_PRIMARY} disabled={props.busy} onClick={props.onEdit}>Modifier</button>
      {props.children}
      <button type="button" className={BUTTON_DANGER} disabled={props.busy} onClick={props.onAskDelete}>Supprimer…</button>
    </div>
  );
}

/** Confirmation en ligne avant d'abandonner une saisie non enregistrée (pas de fenêtre du navigateur). */
export function AbandonBar(props: { onConfirm: () => void; onKeep: () => void }) {
  return (
    <div role="alertdialog" aria-label="Confirmation" className="space-y-2 rounded border border-hub-bad px-3 py-2 text-sm">
      <div>Abandonner la saisie en cours ? Ce qui n'est pas enregistré sera perdu.</div>
      <div className="flex gap-2">
        <button type="button" className={BUTTON_DANGER} onClick={props.onConfirm}>Abandonner la saisie</button>
        <button type="button" className={BUTTON_SECONDARY} onClick={props.onKeep}>Continuer à saisir</button>
      </div>
    </div>
  );
}

/** Boutons d'un formulaire : Enregistrer / Annuler, ou la confirmation d'abandon à leur place. */
export function FormButtons(props: { busy: boolean; askAbandon: boolean; onCancel: () => void; onConfirmAbandon: () => void; onKeepEditing: () => void }) {
  if (props.askAbandon) return <AbandonBar onConfirm={props.onConfirmAbandon} onKeep={props.onKeepEditing} />;
  return (
    <div className="flex gap-2">
      <button type="submit" className={BUTTON_PRIMARY} disabled={props.busy}>Enregistrer</button>
      <button type="button" className={BUTTON_SECONDARY} disabled={props.busy} onClick={props.onCancel}>Annuler</button>
    </div>
  );
}

/** Zone « Liens » d'une fiche, fournie par l'application : les écrans de registre ne dépendent pas les uns des autres (règle R1), l'application les assemble. */
export type LinksSlot = (itemId: number, kind: string) => ReactNode;

/** Changement de statut en un clic : un bouton par statut, sauf le statut courant (transitions libres, décision D47). */
export function StatusSwitcher(props: { statuses: ReadonlyArray<{ value: string; label: string }>; current: string; busy: boolean; onChange: (status: string) => void }) {
  return (
    <div role="group" aria-label="Changer le statut" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-hub-muted">Passer à :</span>
      {props.statuses.filter((s) => s.value !== props.current).map((s) => (
        <button key={s.value} type="button" className={BUTTON_SECONDARY} disabled={props.busy} onClick={() => props.onChange(s.value)}>{s.label}</button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ cadre commun des registres (lot M4, décision D59)
// Extraits de l'écran Besoins/Exigences, où ils existaient déjà (M3b), pour que Décisions et Risques ne les recopient pas.

/** Écran affiché quand aucun projet n'est actif : `what` est le sujet avec son article (« Les décisions »). */
export function NoProjectView(props: { what: string; onGoToProjects: () => void }) {
  return (
    <div className="space-y-2 text-sm">
      <p>Aucun projet actif. {props.what} appartiennent à un projet : créez-en un, ou choisissez-en un dans la liste en haut de l'écran.</p>
      <button type="button" className={BUTTON_PRIMARY} onClick={props.onGoToProjects}>Aller aux projets</button>
    </div>
  );
}

/** En-tête de liste d'un registre : projet, nombre d'éléments (singulier ou pluriel) et bouton de création. */
export function RegisterHeader(props: { projectName: string; total: number; singular: string; plural: string; newLabel: string; onNew: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-hub-muted">Projet : <span className="text-hub-fg">{props.projectName}</span> · {props.total} {props.total > 1 ? props.plural : props.singular}</p>
      <button type="button" className={BUTTON_PRIMARY} onClick={props.onNew}>{props.newLabel}</button>
    </div>
  );
}

/** Actions d'une fiche, communes à tous les registres à statuts libres. */
export interface DetailActions {
  busy: boolean;
  error: string;
  confirmDelete: string | null;
  onEdit: () => void;
  onChangeStatus: (s: string) => void;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onBack: () => void;
}

/**
 * Fiche commune : retour, en-tête, statut et champs propres (en enfants, des paires <dt>/<dd>), erreur, actions ou confirmation de suppression.
 * Le contenu de la zone « Liens » est ajouté par l'écran, sous ce cadre.
 */
export function DetailFrame(props: DetailActions & { code: string; title: string; statusText: string; statuses: ReadonlyArray<{ value: string; label: string }>; current: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <button type="button" className="text-sm text-hub-accent underline" onClick={props.onBack}>← Retour à la liste</button>
      <h3 className="text-lg font-semibold">{props.code} · {props.title}</h3>
      <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
        <dt className="text-hub-muted">Statut</dt><dd>{props.statusText}</dd>
        {props.children}
      </dl>
      {props.error && <p role="alert" className="text-sm text-hub-bad">{props.error}</p>}
      {props.confirmDelete !== null ? (
        <ConfirmBar message={props.confirmDelete} confirmLabel="Supprimer définitivement" busy={props.busy} onConfirm={props.onConfirmDelete} onCancel={props.onCancelDelete} />
      ) : (
        <ItemActionBar busy={props.busy} onEdit={props.onEdit} onAskDelete={props.onAskDelete}>
          <StatusSwitcher statuses={props.statuses} current={props.current} busy={props.busy} onChange={props.onChangeStatus} />
        </ItemActionBar>
      )}
    </div>
  );
}
