import { buildSignature, signatureLines } from '../shared/signature.ts';

/** Fenêtre À propos (exigence E11) : mêmes quatre éléments que les exports, construits par la même fonction. */
export function AboutPanel(props: { version: string; buildDate: string; dataDir: string; schema: number | null }) {
  const sig = buildSignature(props.version);
  const [name, author, version, generated] = signatureLines(sig);
  return (
    <div className="space-y-2 text-sm">
      <div className="text-base font-semibold">{name}</div>
      <div>{author}</div>
      <div>{version}</div>
      <div>{generated}</div>
      <dl className="grid grid-cols-[10rem_1fr] gap-y-1 pt-2 text-hub-muted">
        {props.buildDate && (<><dt>Compilation</dt><dd className="text-hub-fg">{props.buildDate}</dd></>)}
        {props.schema !== null && (<><dt>Schéma de la base</dt><dd className="text-hub-fg">version {props.schema}</dd></>)}
        <dt>Données</dt><dd className="break-all text-hub-fg">{props.dataDir}</dd>
      </dl>
      <p className="pt-1 text-xs text-hub-muted">Application portable, hors ligne : aucune requête réseau, toutes les données vivent dans le dossier BAMentorData à côté de l’exécutable.</p>
    </div>
  );
}
