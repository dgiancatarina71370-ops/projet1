// Éléments d'interface communs (lot M3a). Couche « shared » : elle ne dépend que de shared/ (règle R4).
import type { ReactNode } from 'react';

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
