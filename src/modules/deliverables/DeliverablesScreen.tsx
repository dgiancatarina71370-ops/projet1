// Écran « Livrables » (lot M8) : charge les données du projet actif, génère l'aperçu et exporte. LECTURE SEULE : aucune écriture en base (D96).
import { useEffect, useMemo, useState } from 'react';
import { loadProjectData } from '../../data/repositories/project-export.ts';
import type { ProjectData } from '../../domain/project-data.ts';
import { generateDeliverable } from '../../export/deliverables/models.ts';
import { exportGeneratedToFile } from '../../export/service.ts';
import { FORMATS } from '../../export/pipeline.ts';
import type { ExportFormat } from '../../export/pipeline.ts';
import { formatBytes } from '../../shared/format.ts';
import { Card } from '../../shared/ui.tsx';
import { DeliverablesView, NoProjectView } from './DeliverablesView.tsx';
import { DEFAULT_MODEL, NO_WORKSHOP_VALUE, exportedMessage, modelOf, selectionProblem, workshopChoices } from './logic.ts';

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export interface DeliverablePreset {
  modelId: string;
  workshopId: number;
}

export function DeliverablesScreen(props: { projectId: number | null; projectName: string; version: string; onGoToProjects: () => void; preset?: DeliverablePreset | null; onPresetHandled?: () => void }) {
  const { projectId } = props;
  const [data, setData] = useState<ProjectData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL);
  const [workshopId, setWorkshopId] = useState(NO_WORKSHOP_VALUE);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [askWhere, setAskWhere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ level: 'ok' | 'error'; text: string } | null>(null);

  // Relit les données à chaque arrivée sur l'écran et à chaque changement de projet : le document reflète toujours la base.
  useEffect(() => {
    let dead = false;
    setData(null);
    setMessage(null);
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

  const run = async (format: ExportFormat) => {
    if (projectId === null || model === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const saved = await exportGeneratedToFile(projectId, model.id, format, { version: props.version, askWhere, includeArchived, workshopId: workshopId === NO_WORKSHOP_VALUE ? null : Number(workshopId) });
      if (saved) setMessage({ level: 'ok', text: exportedMessage(FORMATS[format].label, saved.name, formatBytes(saved.sizeBytes), saved.path) });
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
        askWhere={askWhere}
        busy={busy}
        problem={problem}
        preview={preview.text}
        message={message ?? (preview.error ? { level: 'error', text: preview.error } : null)}
        onModel={(v) => { setModelId(v); setMessage(null); }}
        onWorkshop={(v) => { setWorkshopId(v); setMessage(null); }}
        onIncludeArchived={setIncludeArchived}
        onAskWhere={setAskWhere}
        onExport={(f) => void run(f)}
      />
    </Card>
  );
}
