// Écran « Documents » (lot F5) : liste des documents du projet actif, détail, export depuis le contenu figé.
// Lecture seule : cet écran n'écrit rien en base. Un export ne laisse pas de ligne au journal (D96).
// Sélection et case « versions remplacées » repartent de zéro à chaque arrivée et à chaque changement de projet ; une demande
// d'ouverture (venue de Livrables) sélectionne le document demandé, une seule fois.
import { useEffect, useMemo, useState } from 'react';
import { getDocument, listProjectDocuments } from '../../data/repositories/documents.ts';
import type { DocumentDetail, DocumentSummary } from '../../data/repositories/documents.ts';
import { exportDocumentToFile } from '../../export/service.ts';
import { FORMATS } from '../../export/pipeline.ts';
import type { ExportFormat } from '../../export/pipeline.ts';
import { formatBytes } from '../../shared/format.ts';
import { Card } from '../../shared/ui.tsx';
import { DocumentsView, NoProjectView } from './DocumentsView.tsx';
import { detailView, documentLine, exportedMessage, replacedCount, visibleDocuments } from './logic.ts';

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function DocumentsScreen(props: { projectId: number | null; projectName: string; version: string; onGoToProjects: () => void; openId?: number | null; onOpenHandled?: () => void }) {
  const { projectId, openId, onOpenHandled } = props;
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [showReplaced, setShowReplaced] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [askWhere, setAskWhere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ level: 'ok' | 'error'; text: string } | null>(null);

  // Relit la liste à chaque arrivée et à chaque changement de projet : l'écran reflète toujours la base.
  useEffect(() => {
    let dead = false;
    setDocs(null);
    setDetail(null);
    setSelectedId(null);
    setShowReplaced(false);
    setMessage(null);
    setLoadError('');
    if (projectId === null) return () => { dead = true; };
    listProjectDocuments(projectId)
      .then((d) => { if (!dead) setDocs(d); })
      .catch((e) => { if (!dead) setLoadError(errorText(e)); });
    return () => { dead = true; };
  }, [projectId]);

  // Demande d'ouverture : sélectionne le document demandé s'il est dans la liste, puis efface la demande.
  useEffect(() => {
    if (openId === null || openId === undefined || docs === null) return;
    if (docs.some((d) => d.id === openId)) {
      setSelectedId(openId);
      // Une version remplacée n'est visible qu'avec la case : on la coche pour que la sélection reste visible.
      if (docs.some((d) => d.id === openId && d.replaced_by_id !== null)) setShowReplaced(true);
    }
    onOpenHandled?.();
  }, [openId, docs, onOpenHandled]);

  useEffect(() => {
    let dead = false;
    setDetail(null);
    setMessage(null);
    if (selectedId === null) return () => { dead = true; };
    getDocument(selectedId)
      .then((d) => { if (!dead) setDetail(d); })
      .catch((e) => { if (!dead) setMessage({ level: 'error', text: errorText(e) }); });
    return () => { dead = true; };
  }, [selectedId]);

  const shown = useMemo(() => (docs === null ? [] : visibleDocuments(docs, showReplaced)), [docs, showReplaced]);

  const run = async (format: ExportFormat) => {
    if (selectedId === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const saved = await exportDocumentToFile(selectedId, format, { version: props.version, askWhere });
      if (saved) setMessage({ level: 'ok', text: exportedMessage(FORMATS[format].label, saved.name, formatBytes(saved.sizeBytes), saved.path) });
    } catch (e) {
      setMessage({ level: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  if (projectId === null) return <Card title="Documents"><NoProjectView what="Les documents" onGoToProjects={props.onGoToProjects} /></Card>;
  if (loadError) return <Card title="Documents"><p role="alert" className="text-sm text-hub-bad">{loadError}</p></Card>;
  if (docs === null) return <Card title="Documents"><p className="text-sm text-hub-muted">Lecture des documents…</p></Card>;
  return (
    <DocumentsView
      projectName={props.projectName}
      lines={shown.map(documentLine)}
      total={docs.length}
      replacedCount={replacedCount(docs)}
      showReplaced={showReplaced}
      selectedId={selectedId}
      detail={detail === null ? null : detailView(detail)}
      preview={detail === null ? '' : detail.content}
      askWhere={askWhere}
      busy={busy}
      message={message}
      onShowReplaced={setShowReplaced}
      onSelect={setSelectedId}
      onAskWhere={setAskWhere}
      onExport={(f) => void run(f)}
    />
  );
}
