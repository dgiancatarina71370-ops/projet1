// Cadre de l'application (lot M3a, décision D33) : en-tête, choix du projet actif, menu, pied de page. Affichage pur, tout arrive par propriétés.
import type { ReactNode } from 'react';
import { SCREENS } from './navigation.ts';
import type { ScreenId } from './navigation.ts';
import { INPUT_CLASS } from '../shared/ui.tsx';

export interface ProjectOption {
  id: number;
  name: string;
}

export function Shell(props: {
  intro: string;
  /** Faux tant que la base n'est pas prête (démarrage, erreur, base vide) : ni menu ni sélecteur. */
  navigable: boolean;
  screen: ScreenId;
  onNavigate: (s: ScreenId) => void;
  projects: ProjectOption[];
  activeId: number | null;
  onSelectProject: (id: number) => void;
  footer: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-hub-line px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">BA-Mentor</h1>
          {props.navigable && (
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="active-project" className="text-hub-muted">Projet actif</label>
              <select
                id="active-project"
                className={`${INPUT_CLASS} w-64`}
                value={props.activeId === null ? '' : String(props.activeId)}
                disabled={props.projects.length === 0}
                onChange={(e) => props.onSelectProject(Number(e.target.value))}
              >
                {props.projects.length === 0 && <option value="">Aucun projet</option>}
                {props.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <p className="mt-1 text-sm text-hub-muted">{props.intro}</p>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        {props.navigable && (
          <nav aria-label="Navigation" className="border-b border-hub-line p-3 md:w-52 md:border-b-0 md:border-r">
            <ul className="flex gap-2 md:flex-col">
              {SCREENS.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-current={props.screen === s.id ? 'page' : undefined}
                    className={`w-full rounded px-3 py-1.5 text-left text-sm ${props.screen === s.id ? 'bg-hub-panel text-hub-accent' : 'text-hub-fg'}`}
                    onClick={() => props.onNavigate(s.id)}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-6">{props.children}</main>
      </div>

      <footer className="border-t border-hub-line px-6 py-3 text-xs text-hub-muted">{props.footer}</footer>
    </div>
  );
}
