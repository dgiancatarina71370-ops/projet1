import { useState } from 'react';
import { pickImportFile, previewImport, runImport } from '../data/import-v1.ts';
import type { ImportCounts, ImportPreview, ImportReport } from '../data/import-v1.ts';
import type { PickedTextFile } from '../data/driver.ts';
import { formatBytes } from '../shared/format.ts';

const LABEL: Record<keyof ImportCounts, string> = {
  projects: 'Projets et dossiers',
  documents: 'Livrables',
  sends: 'Envois consignés',
  contacts: 'Contacts (parties prenantes)',
  dodItems: 'Critères de « terminé »',
  notes: 'Bloc-notes',
  pspoSteps: 'Étapes du parcours PSPO',
  settings: 'Réglages',
  flags: 'Interrupteurs de fonctions',
};

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const MAX_WARNINGS_SHOWN = 12;

function CountsTable(props: { counts: ImportCounts; actual?: ImportCounts }) {
  const keys = Object.keys(LABEL) as Array<keyof ImportCounts>;
  return (
    <table className="w-full text-left">
      <thead className="text-hub-muted">
        <tr><th className="py-1 pr-3">Élément</th><th className="pr-3 text-right">{props.actual ? 'Annoncé' : 'À importer'}</th>{props.actual && <th className="text-right">Écrit</th>}</tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k} className="border-t border-hub-line">
            <td className="py-1 pr-3">{LABEL[k]}</td>
            <td className="pr-3 text-right">{props.counts[k]}</td>
            {props.actual && <td className={`text-right ${props.actual[k] === props.counts[k] ? 'text-hub-ok' : 'text-hub-bad'}`}>{props.actual[k]}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Warnings(props: { list: string[] }) {
  if (props.list.length === 0) return null;
  return (
    <div className="rounded border border-yellow-500 p-3 text-yellow-300">
      <div className="font-medium">{props.list.length} avertissement(s) : ces éléments sont corrigés à l’import, rien ne bloque.</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {props.list.slice(0, MAX_WARNINGS_SHOWN).map((w, i) => <li key={i}>{w}</li>)}
      </ul>
      {props.list.length > MAX_WARNINGS_SHOWN && <div className="mt-1">… et {props.list.length - MAX_WARNINGS_SHOWN} autre(s).</div>}
    </div>
  );
}

/**
 * Import d'un export JSON de la V1 : choix du fichier → aperçu chiffré → confirmation → import (une seule transaction, sauvegarde de sécurité avant).
 * `onImported` : l'application relit ses données (liste des projets, journal, sauvegardes).
 */
export function ImportPanel(props: { onImported: () => void }) {
  const [file, setFile] = useState<PickedTextFile | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setFile(null);
    setPreview(null);
    setReport(null);
    setConfirmDuplicate(false);
    setError('');
  };

  const choose = async () => {
    setBusy(true);
    reset();
    try {
      const picked = await pickImportFile();
      if (!picked) return; // annulé par l'utilisateur
      setFile(picked);
      setPreview(await previewImport({ name: picked.name, text: picked.text, sha256: picked.sha256 }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!file || !preview) return;
    setBusy(true);
    setError('');
    try {
      const r = await runImport({ name: file.name, text: file.text, sha256: file.sha256 }, { allowDuplicate: confirmDuplicate });
      setReport(r);
      setPreview(null);
      setFile(null);
      props.onImported();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const duplicate = preview?.alreadyImportedAt != null;
  const nothing = preview ? Object.values(preview.plan.expected).every((v) => v === 0) : false;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-hub-muted">
        Reprend les données d’un export JSON de BA-Mentor V1 (menu d’export de la V1). Rien n’est écrit avant votre confirmation ; une sauvegarde de sécurité est faite juste avant ; l’import est une seule opération : en cas d’erreur, la base reste inchangée.
      </p>
      <button type="button" disabled={busy} onClick={choose} className="rounded border border-hub-line px-3 py-1.5 disabled:opacity-50">
        Choisir un export V1 (.json)…
      </button>

      {error && <p role="alert" className="break-words text-hub-bad">{error}</p>}

      {file && preview && (
        <div className="space-y-3 rounded border border-hub-line p-3">
          <div>
            <div className="break-all font-medium">{file.name}</div>
            <div className="text-hub-muted">{formatBytes(file.sizeBytes)} · SHA-256 {file.sha256.slice(0, 16)}… · exporté le {preview.parsed.exportedAt.slice(0, 16).replace('T', ' ')} UTC</div>
          </div>

          {preview.parsed.sampleOnly && (
            <p role="status" className="rounded border border-yellow-500 px-3 py-2 text-yellow-300">
              Les projets et livrables de ce fichier sont uniquement les données d’exemple que la V1 crée au premier lancement. Ils seront importés comme le reste et compteront dans vos statistiques : supprimez-les ensuite si vous n’en voulez pas.
            </p>
          )}
          {duplicate && (
            <div role="alert" className="rounded border border-hub-bad px-3 py-2">
              <p className="text-hub-bad">Ce fichier a déjà été importé le {preview.alreadyImportedAt!.slice(0, 16).replace('T', ' ')} UTC. Un nouvel import duplique les projets et livrables ; les réglages, contacts, notes, étapes PSPO et critères déjà présents ne sont pas modifiés.</p>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={confirmDuplicate} onChange={(e) => setConfirmDuplicate(e.target.checked)} />
                Je confirme vouloir importer ce fichier une seconde fois.
              </label>
            </div>
          )}

          <CountsTable counts={preview.plan.expected} />
          {preview.plan.kept.length > 0 && (
            <ul className="list-disc pl-5 text-hub-muted">
              {preview.plan.kept.map((k) => <li key={k.what}>{k.count} {k.what} : conservé(s) tel(s) quel(s), non écrasé(s).</li>)}
            </ul>
          )}
          <Warnings list={preview.parsed.warnings} />
          {nothing && <p className="text-hub-muted">Rien de nouveau à importer.</p>}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || nothing || (duplicate && !confirmDuplicate)}
              onClick={doImport}
              className="rounded bg-hub-accent px-3 py-1.5 font-medium text-hub-bg disabled:opacity-50"
            >
              Importer
            </button>
            <button type="button" disabled={busy} onClick={reset} className="rounded border border-hub-line px-3 py-1.5 disabled:opacity-50">Annuler</button>
          </div>
        </div>
      )}

      {report && (
        <div className="space-y-3 rounded border border-hub-line p-3">
          <p role="status" className={report.matches ? 'text-hub-ok' : 'text-hub-bad'}>
            {report.matches
              ? `Import terminé : les totaux écrits correspondent à l’aperçu (${report.journalLines} lignes au journal d’activité).`
              : 'Import terminé, mais les totaux écrits diffèrent de l’aperçu : ne continuez pas avant d’avoir comparé, et signalez-le (la sauvegarde de sécurité permet de revenir en arrière).'}
          </p>
          <CountsTable counts={report.expected} actual={report.actual} />
          <p className="break-all text-hub-muted">Sauvegarde de sécurité : {report.safetyBackup}</p>
          <Warnings list={report.warnings} />
        </div>
      )}
    </div>
  );
}
