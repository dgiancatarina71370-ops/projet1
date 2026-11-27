// Écran de registre générique (lot M8b, décision D99) : regroupe la mécanique commune aux écrans de registre (liste, fiche, formulaire,
// suppression confirmée, abandon de saisie, ouverture demandée par la traçabilité). Chaque écran fournit une CONFIGURATION : libellés, accès aux
// données, vues et validation de son type. Règle R4 : ce fichier n'importe jamais la couche data ; les accès aux données lui sont injectés par la configuration.
// Les transitions d'état sont dans register-state.ts (logique pure testée) ; ici ne reste que le branchement React.
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { ComponentType } from 'react';
import { DEFAULT_SORT, deletionMessage, filterByStatus, searchRows, sortRows, statusCounts } from './register-logic.ts';
import type { SortKey } from './register-logic.ts';
import { initialState, registerReducer } from './register-state.ts';
import type { RegisterAction, RegisterState } from './register-state.ts';
import { Card, NoProjectView } from './ui.tsx';
import type { DetailActions, LinksSlot, ListExtras } from './ui.tsx';
import { useOpenRequest } from './use-open-request.ts';

/** Ce que le composant exige d'une ligne de registre. */
export interface RegisterRow {
  id: number;
  code: string;
  title: string;
  description: string;
  status: string;
  /** Date de modification : lue par tous les dépôts de registre ; sert au tri « Modifié récemment » (lot F2). Absente, elle compte comme vide. */
  updated_at?: string;
}

export type FormErrors<F> = Partial<Record<keyof F, string>>;

/** Résultat de validation : soit les erreurs par champ, soit les valeurs normalisées prêtes à enregistrer (`V`). */
export type Validation<F, V> = ({ ok: true } & V) | { ok: false; errors: FormErrors<F> };

export interface RegisterListProps<Row> extends ListExtras {
  projectName: string;
  rows: Row[];
  total: number;
  filter: string;
  onFilter: (filter: string) => void;
  onNew: () => void;
  onOpen: (id: number) => void;
}

export interface RegisterFormProps<F> {
  heading: string;
  values: F;
  errors: FormErrors<F>;
  busy: boolean;
  error: string;
  onChange: (key: keyof F, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  askAbandon: boolean;
  onConfirmAbandon: () => void;
  onKeepEditing: () => void;
}

/** Accès aux données, fournis par l'écran (jamais importés ici : règle R4). */
export interface RegisterOps<Row, V> {
  list: (projectId: number) => Promise<Row[]>;
  /** Crée l'élément et retourne son identifiant. */
  create: (projectId: number, value: V) => Promise<number>;
  update: (id: number, value: V) => Promise<unknown>;
  setStatus: (id: number, status: string) => Promise<unknown>;
  remove: (id: number) => Promise<unknown>;
  countLinks: (id: number) => Promise<number>;
}

/**
 * Configuration d'un écran de registre. DOIT être une constante de module : le composant s'en sert comme dépendance de ses effets.
 * `V` : valeurs validées. `X` : propriétés supplémentaires de la fiche (ex. un bouton propre au type).
 */
export interface RegisterConfig<Row extends RegisterRow, F extends object, V extends object, X extends object = object> {
  /** Titre de la carte (« Ateliers »). */
  title: string;
  /** Sujet de la phrase « Aucun projet actif. … appartiennent à un projet » (« Les ateliers »). */
  what: string;
  /** Type d'élément transmis à l'emplacement des liens (« workshop »). */
  kind: string;
  /** Phrase affichée quand la fiche ouverte a disparu (« Cet atelier n'existe plus. »). */
  gone: string;
  createHeading: string;
  editHeading: string;
  emptyForm: F;
  formFrom: (row: Row) => F;
  validate: (values: F) => Validation<F, V>;
  ops: RegisterOps<Row, V>;
  ListView: ComponentType<RegisterListProps<Row>>;
  DetailView: ComponentType<DetailActions & { row: Row } & X>;
  FormView: ComponentType<RegisterFormProps<F>>;
}

export interface RegisterScreenProps<Row extends RegisterRow, F extends object, V extends object, X extends object> {
  config: RegisterConfig<Row, F, V, X>;
  projectId: number | null;
  projectName: string;
  onGoToProjects: () => void;
  onChanged: () => void;
  renderLinks?: LinksSlot;
  openId?: number | null;
  onOpenHandled?: () => void;
  /** Propriétés supplémentaires de la fiche, calculées pour la ligne affichée. */
  detailExtra?: (row: Row) => X;
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function RegisterScreen<Row extends RegisterRow, F extends object, V extends object, X extends object = object>(props: RegisterScreenProps<Row, F, V, X>) {
  const { config, projectId } = props;
  const { ListView, DetailView, FormView } = config;
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [loadError, setLoadError] = useState('');
  const [state, dispatch] = useReducer(
    (s: RegisterState<F>, a: RegisterAction<F>) => registerReducer(s, a),
    config.emptyForm,
    (empty: F) => initialState(empty),
  );

  const reload = useCallback(async () => {
    if (projectId === null) { setRows([]); return; }
    try {
      setRows(await config.ops.list(projectId));
      setLoadError('');
    } catch (e) {
      setLoadError(messageOf(e));
    }
  }, [projectId, config]);

  // Changer de projet ramène à la liste : une fiche ouverte appartient à l'ancien projet.
  // La recherche est vidée au changement de projet (F2-D05) ; le tri et le filtre gardent leur valeur.
  useEffect(() => {
    dispatch({ type: 'projectChanged' });
    setQuery('');
    void reload();
  }, [reload]);

  // Ouverture demandée depuis la traçabilité (D76) : fiche ouverte dès que la liste est chargée.
  useOpenRequest(props.openId, rows.map((r) => r.id), (id) => dispatch({ type: 'open', id }), props.onOpenHandled);

  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    dispatch({ type: 'runStart' });
    try {
      await fn();
      await reload();
      props.onChanged();
      return true;
    } catch (e) {
      dispatch({ type: 'fail', message: messageOf(e) });
      return false;
    } finally {
      dispatch({ type: 'runEnd' });
    }
  };

  // Ordre de traitement (F2) : la recherche d'abord, les compteurs sur son résultat, puis le filtre de statut, puis le tri. Tout se passe en mémoire.
  const searched = useMemo(() => searchRows(rows, query), [rows, query]);
  const counts = useMemo(() => statusCounts(searched), [searched]);
  const visible = useMemo(() => sortRows(filterByStatus(searched, filter), sort), [searched, filter, sort]);

  if (projectId === null) return <Card title={config.title}><NoProjectView what={config.what} onGoToProjects={props.onGoToProjects} /></Card>;

  const { mode } = state;
  const current = mode.kind === 'detail' ? rows.find((r) => r.id === mode.id) ?? null : null;
  const openForm = (row: Row | null) => dispatch({ type: 'openForm', id: row ? row.id : null, start: row ? config.formFrom(row) : config.emptyForm });
  const submit = async () => {
    const r = config.validate(state.values);
    if (!r.ok) { dispatch({ type: 'invalid', errors: r.errors }); return; }
    dispatch({ type: 'valid' });
    if (mode.kind !== 'form') return;
    const id = mode.id;
    let savedId: number | null = id;
    const ok = await run(async () => {
      if (id === null) savedId = await config.ops.create(projectId, r);
      else await config.ops.update(id, r);
    });
    if (ok && savedId !== null) dispatch({ type: 'saved', id: savedId });
  };

  return (
    <Card title={config.title}>
      {loadError && <p role="alert" className="mb-2 text-sm text-hub-bad">{loadError}</p>}
      {mode.kind === 'list' && (
        <ListView
          projectName={props.projectName}
          rows={visible}
          total={rows.length}
          counts={counts}
          query={query}
          onQuery={setQuery}
          sort={sort}
          onSort={setSort}
          filter={filter}
          onFilter={setFilter}
          onNew={() => openForm(null)}
          onOpen={(id) => dispatch({ type: 'open', id })}
        />
      )}
      {mode.kind === 'detail' && current && (
        <div className="space-y-4">
          <DetailView
            {...((props.detailExtra ? props.detailExtra(current) : {}) as X)}
            row={current}
            busy={state.busy}
            error={state.error}
            confirmDelete={state.confirmDelete}
            onEdit={() => openForm(current)}
            onChangeStatus={(s) => void run(() => config.ops.setStatus(current.id, s))}
            onAskDelete={async () => {
              try {
                dispatch({ type: 'askDelete', message: deletionMessage(current.code, current.title, await config.ops.countLinks(current.id)) });
              } catch (e) {
                dispatch({ type: 'fail', message: messageOf(e) });
              }
            }}
            onConfirmDelete={async () => {
              if (await run(() => config.ops.remove(current.id))) dispatch({ type: 'deleted' });
            }}
            onCancelDelete={() => dispatch({ type: 'cancelDelete' })}
            onBack={() => dispatch({ type: 'backToList' })}
          />
          {props.renderLinks?.(current.id, config.kind)}
        </div>
      )}
      {mode.kind === 'detail' && !current && (
        <div className="space-y-2 text-sm">
          <p>{config.gone}</p>
          <button type="button" className="text-hub-accent underline" onClick={() => dispatch({ type: 'leaveMissing' })}>← Retour à la liste</button>
        </div>
      )}
      {mode.kind === 'form' && (
        <FormView
          heading={mode.id === null ? config.createHeading : config.editHeading}
          values={state.values}
          errors={state.errors}
          busy={state.busy}
          error={state.error}
          onChange={(k, v) => dispatch({ type: 'change', key: k, value: v })}
          onSubmit={() => void submit()}
          onCancel={() => dispatch({ type: 'cancelForm' })}
          askAbandon={state.askAbandon}
          onConfirmAbandon={() => dispatch({ type: 'leaveForm' })}
          onKeepEditing={() => dispatch({ type: 'keepEditing' })}
        />
      )}
    </Card>
  );
}
