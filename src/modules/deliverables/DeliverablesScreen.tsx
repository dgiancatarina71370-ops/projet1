// Écran « Livrables » (lots M8 puis F5) : charge les données du projet actif, génère l'aperçu et l'ENREGISTRE comme document (F5-D05, F5-D06).
// La génération et l'aperçu ne modifient rien ; seul le bouton « Enregistrer comme document » écrit (une ligne de journal). L'export se fait dans Documents.
import { useEffect, useMemo, useState } from 'react';
import { loadProjectData } from '../../data/repositories/project-export.ts';
import type { ProjectData } from '../../domain/project-data.ts';
import { generateDeliverable } from '../../export/deliverables/models.ts';
import { saveDeliverable } from '../../export/service.ts';
import { Card } from '../../shared/ui.tsx';
import { DeliverablesView, NoProjectView } from './DeliverablesView.tsx';
import { DEFAULT_MODEL, NO_WORKSHOP_VALUE, modelOf, savedMessage, selectionProblem, workshopChoices } from './logic.ts';

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export interface DeliverablePreset {
  modelId: string;
  workshopId: number;
}

export function DeliverablesScreen(props: { projectId: number | null; projectName: string; onGoToProjects: () => void; onOpenDocument: (id: number) => void; preset?: DeliverablePreset | null; onPresetHandled?: () => void }) {
  const { projectId } = props;
  const [data, setData] = useState<ProjectData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL);
  const [workshopId, setWorkshopId] = useState(NO_WORKSHOP_VALUE);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ level: 'ok' | 'error'; text: string } | null>(null);

  // Relit les données à chaque arrivée sur l'écran et à chaque changement de projet : le document reflète toujours la base.
  useEffect(() => {
    let dead = false;
    setData(null);
    setMessage(null);
    setSavedId(null);
    setWorkshopId(NO_WORKSHOP_VALUE);
    if (projectId === null) return () => { dead = true; };
    loadProjectData(projectId)
      .then((d) => { if (!dead) { setData(d); setLoadError(d === null ? 'Ce projet n\'existe plus.' : ''); } })
      .catch((e) => { if (!dead) setLoadError(errorText(e)); });
    return () => { dead = true; };
  }, [projectId]);

  // Demande venue de la fiche d'un atelier (D92) : modèle et atelier présélectionnés, une seule fois, quand les données sont là.
  const { preset, onPresetHandled } = props;
  useEffect(() => {
    if (!preset || data === null) return;
    if (data.items.some((i) => i.kind === 'workshop' && i.id === preset.workshopId)) {
      setModelId(preset.modelId);
      setWorkshopId(String(preset.workshopId));
    }
    onPresetHandled?.();
  }, [preset, data, onPresetHandled]);

  const model = modelOf(modelId);
  const workshops = useMemo(() => (data ? workshopChoices(data.items) : workshopChoices([])), [data]);
  const problem = selectionProblem(model, workshopId, workshops.length - 1);

  const preview = useMemo(() => {
    if (data === null || model === null || problem !== '') return { text: '', error: '' };
    try {
      return { text: generateDeliverable(model.id, data, { includeArchived, workshopId: workshopId === NO_WORKSHOP_VALUE ? null : Number(workshopId) }).markdown, error: '' };
    } catch (e) {
      return { text: '', error: errorText(e) };
    }
  }, [data, model, problem, includeArchived, workshopId]);

  const save = async () => {
    if (projectId === null || model === null) return;
    setBusy(true);
    setMessage(null);
    setSavedId(null);
    try {
      const saved = await saveDeliverable(projectId, model.id, { includeArchived, workshopId: workshopId === NO_WORKSHOP_VALUE ? null : Number(workshopId) });
      setSavedId(saved.id);
      setMessage({ level: 'ok', text: savedMessage(saved) });
    } catch (e) {
      setMessage({ level: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  if (projectId === null) return <Card title="Livrables"><NoProjectView what="Les livrables" onGoToProjects={props.onGoToProjects} /></Card>;
  if (data === null) return <Card title="Livrables">{loadError ? <p role="alert" className="text-sm text-hub-bad">{loadError}</p> : <p className="text-sm text-hub-muted">Lecture du projet…</p>}</Card>;
  return (
    <Card title="Livrables">
      <DeliverablesView
        projectName={props.projectName}
        modelId={modelId}
        model={model}
        workshopOptions={workshops}
        workshopId={workshopId}
        includeArchived={includeArchived}
        busy={busy}
        problem={problem}
        preview={preview.text}
        message={message ?? (preview.error ? { level: 'error', text: preview.error } : null)}
        onModel={(v) => { setModelId(v); setMessage(null); setSavedId(null); }}
        onWorkshop={(v) => { setWorkshopId(v); setMessage(null); setSavedId(null); }}
        onIncludeArchived={setIncludeArchived}
        onSave={() => void save()}
        savedDocumentId={savedId}
        onOpenDocument={props.onOpenDocument}
      />
    </Card>
  );
}
