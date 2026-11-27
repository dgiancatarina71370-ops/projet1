// Écran « Documents » (lot F5) : liste des documents du projet actif, détail, export depuis le contenu figé.
// Écritures (lot F6) : Valider, Archiver, Désarchiver, chacune gardée par l'état attendu et journalisée ; jamais le contenu. Un export ou une comparaison n'écrit rien (D96).
// Sélection et case « versions remplacées » repartent de zéro à chaque arrivée et à chaque changement de projet ; une demande
// d'ouverture (venue de Livrables) sélectionne le document demandé, une seule fois.
import { useEffect, useMemo, useState } from 'react';
import { archiveDocument, getDocument, listProjectDocuments, unarchiveDocument, validateDocument } from '../../data/repositories/documents.ts';
import type { DocumentDetail, DocumentSummary } from '../../data/repositories/documents.ts';
import { compareDocumentWithCurrent, exportDocumentToFile } from '../../export/service.ts';
import { FORMATS } from '../../export/pipeline.ts';
import type { ExportFormat } from '../../export/pipeline.ts';
import { formatBytes } from '../../shared/format.ts';
import { Card } from '../../shared/ui.tsx';
import { DocumentsView, NoProjectView } from './DocumentsView.tsx';
import { archivedCount, archivedMessage, comparisonView, detailView, documentLine, exportedMessage, replacedCount, unarchivedMessage, validatedMessage, visibleDocuments } from './logic.ts';
import type { ComparisonView } from './logic.ts';

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function DocumentsScreen(props: { projectId: number | null; projectName: string; version: string; onGoToProjects: () => void; openId?: number | null; onOpenHandled?: () => void }) {
  const { projectId, openId, onOpenHandled } = props;
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [showReplaced, setShowReplaced] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [validating, setValidating] = useState(false);
  const [comment, setComment] = useState('');
  const [comparison, setComparison] = useState<{ view: ComparisonView } | { unavailable: string } | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [askWhere, setAskWhere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ level: 'ok' | 'error'; text: string } | null>(null);

  // Changement de projet (et arrivée sur l'écran) : tout repart de zéro.
  useEffect(() => {
    setDocs(null);
    setDetail(null);
    setSelectedId(null);
    setShowReplaced(false);
    setShowArchived(false);
    setMessage(null);
    setLoadError('');
  }, [projectId]);

  // Relit la liste à l'arrivée, au changement de projet et après chaque geste d'écriture : l'écran reflète toujours la base.
  useEffect(() => {
    let dead = false;
    if (projectId === null) return () => { dead = true; };
    listProjectDocuments(projectId)
      .then((d) => { if (!dead) setDocs(d); })
      .catch((e) => { if (!dead) setLoadError(errorText(e)); });
    return () => { dead = true; };
  }, [projectId, reloadTick]);

  // Demande d'ouverture : sélectionne le document demandé s'il est dans la liste, puis efface la demande.
  useEffect(() => {
    if (openId === null || openId === undefined || docs === null) return;
    if (docs.some((d) => d.id === openId)) {
      setSelectedId(openId);
      // Une version remplacée n'est visible qu'avec la case : on la coche pour que la sélection reste visible.
      if (docs.some((d) => d.id === openId && d.replaced_by_id !== null)) setShowReplaced(true);
      if (docs.some((d) => d.id === openId && d.status === 'archived' && d.replaced_by_id === null)) setShowArchived(true);
    }
    onOpenHandled?.();
  }, [openId, docs, onOpenHandled]);

  // Changer de document efface le message, le cadre de validation et la comparaison.
  useEffect(() => {
    setMessage(null);
    setValidating(false);
    setComment('');
    setComparison(null);
  }, [selectedId]);

  useEffect(() => {
    let dead = false;
    if (selectedId === null) { setDetail(null); return () => { dead = true; }; }
    getDocument(selectedId)
      .then((d) => { if (!dead) setDetail(d); })
      .catch((e) => { if (!dead) setMessage({ level: 'error', text: errorText(e) }); });
    return () => { dead = true; };
  }, [selectedId, reloadTick]);

  const shown = useMemo(() => (docs === null ? [] : visibleDocuments(docs, showReplaced, showArchived)), [docs, showReplaced, showArchived]);

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

  // Un geste d'écriture : message, puis relecture de la liste et du détail (la base reste la source de vérité).
  const act = async (what: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      const text = await what();
      setValidating(false);
      setComment('');
      setComparison(null);
      setReloadTick((n) => n + 1);
      setMessage({ level: 'ok', text });
    } catch (e) {
      setMessage({ level: 'error', text: errorText(e) });
      setReloadTick((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const confirmValidate = () => {
    if (selectedId === null) return;
    void act(async () => {
      await validateDocument(selectedId, comment);
      const d = await getDocument(selectedId);
      return validatedMessage(d?.validated_at ?? new Date().toISOString());
    });
  };

  const compare = async () => {
    if (selectedId === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await compareDocumentWithCurrent(selectedId);
      setComparison(r.available ? { view: comparisonView(r.comparison) } : { unavailable: r.reason });
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
      archivedCount={archivedCount(docs)}
      showArchived={showArchived}
      validating={validating}
      comment={comment}
      comparison={comparison}
      selectedId={selectedId}
      detail={detail === null ? null : detailView(detail)}
      preview={detail === null ? '' : detail.content}
      askWhere={askWhere}
      busy={busy}
      message={message}
      onShowReplaced={setShowReplaced}
      onShowArchived={setShowArchived}
      onStartValidate={() => setValidating(true)}
      onCancelValidate={() => { setValidating(false); setComment(''); }}
      onComment={setComment}
      onConfirmValidate={confirmValidate}
      onArchive={() => { if (selectedId !== null) void act(async () => { await archiveDocument(selectedId); return archivedMessage; }); }}
      onUnarchive={() => { if (selectedId !== null) void act(async () => unarchivedMessage(await unarchiveDocument(selectedId))); }}
      onCompare={() => void compare()}
      onSelect={setSelectedId}
      onAskWhere={setAskWhere}
      onExport={(f) => void run(f)}
    />
  );
}
