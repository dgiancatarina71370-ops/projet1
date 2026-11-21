// Lecture et contrôle d'un export JSON de la V1 (spécification, section 11). Aucun accès à la base : fonction pure, testée seule.
// Le format a été vérifié sur un export réel de la V1 (voir DECISIONS.md, lot V2.2b).
// Principe : un défaut de STRUCTURE est refusé avec le chemin de la clé fautive ; un défaut de DONNÉE isolée est corrigé et signalé par un avertissement.

export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportFormatError';
  }
}

export type ProjectKind = 'project' | 'folder' | 'archive';
export type DocStatus = 'draft' | 'validated' | 'archived';

export interface ImportProject {
  /** Identifiant V1 (chaîne de 8 caractères). Sert uniquement à relier les éléments entre eux pendant l'import. */
  v1Id: string;
  /** null = élément racine. */
  parentV1Id: string | null;
  kind: ProjectKind;
  name: string;
  /** Décision D1 : date du plus ancien livrable contenu ; à défaut, date de l'export. */
  createdAt: string;
}

export interface ImportSend {
  recipients: string;
  sentAt: string;
}

export interface ImportDocument {
  v1Id: string;
  projectV1Id: string;
  previousProjectV1Id: string | null;
  kind: string;
  name: string;
  status: DocStatus;
  content: string;
  updatedAt: string;
  validatedAt: string | null;
  archivedAt: string | null;
  sends: ImportSend[];
}

export interface ImportFlag {
  key: string;
  enabled: boolean;
  custom: boolean;
  label: string | null;
  description: string | null;
  group: string | null;
}

export interface ParsedImport {
  fileSha256: string;
  exportedAt: string;
  generator: string | null;
  /** Parents toujours avant leurs enfants. */
  projects: ImportProject[];
  documents: ImportDocument[];
  settings: Array<{ key: string; value: string }>;
  flags: ImportFlag[];
  contacts: Array<{ name: string; email: string }>;
  dod: Array<{ text: string; enabled: boolean }>;
  notes: { title: string; text: string } | null;
  pspo: Array<{ stepId: string; done: boolean }>;
  /** Décision D4 : tous les projets et livrables sont les données d'exemple que la V1 crée au premier lancement. */
  sampleOnly: boolean;
  warnings: string[];
}

export const EXPORT_FORMAT = 'ba-mentor-v1-export';
export const ORPHAN_PROJECT_NAME = 'Import V1 — éléments sans dossier';

/** Contenu des données d'exemple de la V1 (créées au premier lancement). Sert uniquement à reconnaître un export qui n'en contient pas d'autres. */
const SEED_NAMES = new Set([
  'Projet exemple — Référentiel clients',
  '01 Cadrage',
  '02 Ateliers',
  '03 Spécifications',
  '04 Recette',
  '99 Archives',
  'CR atelier — fusion des fiches (exemple)',
]);
const SEED_DOC_SHA256 = '1f898241d0e7b730aa26fdb041fbd33145436048d3d1f23c9991f49f0e18c739';

const STATUS: Record<string, DocStatus> = { brouillon: 'draft', 'validé': 'validated', 'archivé': 'archived' };

export async function sha256Text(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function need(cond: boolean, path: string, expected: string, value: unknown): asserts cond {
  if (!cond) {
    const seen = value === undefined ? 'absent' : Array.isArray(value) ? 'un tableau' : value === null ? 'null' : typeof value;
    throw new ImportFormatError(`Format V1 invalide : « ${path} » doit être ${expected} (trouvé : ${seen}).`);
  }
}

/** Date ISO 8601 valide, normalisée en UTC ; null sinon. */
function isoOrNull(v: unknown): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export interface ParseInput {
  text: string;
  /** Empreinte SHA-256 des octets du fichier (calculée par le noyau à la lecture). */
  sha256: string;
  /** Instant de l'import, injecté pour que les tests soient déterministes. */
  now?: Date;
}

export async function parseV1Export(input: ParseInput): Promise<ParsedImport> {
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);

  let root: unknown;
  try {
    root = JSON.parse(input.text.replace(/^\uFEFF/, '')); // le noyau retire déjà la marque d'ordre des octets ; ceinture et bretelles
  } catch (e) {
    throw new ImportFormatError(`Ce fichier n'est pas un JSON valide : ${e instanceof Error ? e.message : String(e)}`);
  }
  need(isObj(root), 'le fichier', 'un objet JSON', root);
  if (root.format !== EXPORT_FORMAT) {
    throw new ImportFormatError(`Ce fichier n'est pas un export de BA-Mentor V1 (clé « format » attendue : « ${EXPORT_FORMAT} »${typeof root.format === 'string' ? `, trouvée : « ${root.format} »` : ''}).`);
  }
  if (root.formatVersion !== 1) {
    throw new ImportFormatError(
      typeof root.formatVersion === 'number' && root.formatVersion > 1
        ? `Cet export a un format plus récent (version ${root.formatVersion}) que ce que cette version de BA-Mentor sait lire (version 1).`
        : `Version de format non reconnue : « ${String(root.formatVersion)} » (attendu : 1).`,
    );
  }
  const state = root.state;
  need(isObj(state), 'state', 'un objet', state);

  const now = (input.now ?? new Date()).toISOString();
  const parsedExportedAt = isoOrNull(root.exportedAt);
  if (parsedExportedAt === null) warn('La date d\'export est absente ou illisible : la date du jour la remplace pour dater les projets sans livrable.');
  const exportedAt: string = parsedExportedAt ?? now;
  const generator = typeof root.generator === 'string' ? root.generator : null;

  const known = ['v', 'theme', 'flags', 'customFlags', 'settings', 'nodes', 'notes', 'stakeholders', 'dod', 'pspo'];
  const unknown = Object.keys(state).filter((k) => !known.includes(k));
  if (unknown.length > 0) warn(`Clés inconnues ignorées dans « state » : ${unknown.join(', ')}.`);

  // --- Arborescence ---------------------------------------------------------------------------------------------------
  const rawNodes = state.nodes === undefined ? [] : state.nodes;
  need(Array.isArray(rawNodes), 'state.nodes', 'un tableau', rawNodes);
  interface Node {
    id: string;
    parent: string | null;
    type: 'folder' | 'doc';
    name: string;
    obj: Obj;
    index: number;
  }
  const nodes: Node[] = [];
  const byId = new Map<string, Node>();
  rawNodes.forEach((n: unknown, i: number) => {
    const p = `state.nodes[${i}]`;
    need(isObj(n), p, 'un objet', n);
    need(typeof n.id === 'string' && n.id !== '', `${p}.id`, 'une chaîne non vide', n.id);
    need(n.type === 'folder' || n.type === 'doc', `${p}.type`, '« folder » ou « doc »', n.type);
    need(n.parent === null || n.parent === undefined || typeof n.parent === 'string', `${p}.parent`, 'une chaîne ou null', n.parent);
    if (byId.has(n.id)) throw new ImportFormatError(`Format V1 invalide : l'identifiant « ${n.id} » apparaît deux fois (state.nodes[${i}]).`);
    let name = typeof n.name === 'string' ? n.name.trim() : '';
    if (name === '') {
      warn(`Élément « ${n.id} » sans nom : intitulé « Sans titre » appliqué.`);
      name = 'Sans titre';
    }
    const node: Node = { id: n.id, parent: n.parent ?? null, type: n.type, name, obj: n, index: i };
    nodes.push(node);
    byId.set(n.id, node);
  });

  // Une cible de rattachement valide est un dossier présent dans l'export.
  const folderParent = (n: Node): Node | null => {
    if (n.parent === null) return null;
    const p = byId.get(n.parent);
    return p && p.type === 'folder' ? p : null;
  };
  // Un cycle ne peut pas être importé : aucun point de départ.
  for (const n of nodes) {
    const seen = new Set<string>([n.id]);
    let cur = folderParent(n);
    while (cur) {
      if (seen.has(cur.id)) throw new ImportFormatError(`Format V1 invalide : l'arborescence boucle sur elle-même autour de « ${cur.id} ».`);
      seen.add(cur.id);
      cur = folderParent(cur);
    }
  }

  // Éléments dont le parent est absent, ou n'est pas un dossier : rattachés à un projet d'accueil, créé seulement si nécessaire.
  const orphanFolders = nodes.filter((n) => n.type === 'folder' && n.parent !== null && folderParent(n) === null);
  const orphanDocs = nodes.filter((n) => n.type === 'doc' && folderParent(n) === null);
  const ORPHAN_ID = '\u0000orphans';
  if (orphanFolders.length + orphanDocs.length > 0) {
    warn(`${orphanFolders.length + orphanDocs.length} élément(s) sans dossier valide : rattaché(s) au projet « ${ORPHAN_PROJECT_NAME} ».`);
  }

  // --- Livrables ------------------------------------------------------------------------------------------------------
  const kindOfDoc = (n: Node, label: string): string => {
    const k = n.obj.kind;
    if (typeof k === 'string' && k.trim() !== '') return k.trim();
    warn(`${label} : type de livrable absent, « cr » appliqué.`);
    return 'cr';
  };
  const documents: ImportDocument[] = [];
  for (const n of nodes) {
    if (n.type !== 'doc') continue;
    const o = n.obj;
    const label = `Livrable « ${n.name} »`;
    const rawStatus = typeof o.status === 'string' ? o.status : '';
    let status = STATUS[rawStatus];
    if (!status) {
      warn(`${label} : statut ${rawStatus === '' ? 'absent' : `« ${rawStatus} » inconnu`}, « brouillon » appliqué.`);
      status = 'draft';
    }
    let updatedAt = isoOrNull(o.updated);
    if (updatedAt === null) {
      warn(`${label} : date de modification absente ou illisible, date d'export appliquée.`);
      updatedAt = exportedAt;
    }
    if (o.content !== undefined && typeof o.content !== 'string') warn(`${label} : contenu illisible (texte attendu), livrable importé vide.`);
    const sends: ImportSend[] = [];
    if (o.sent !== undefined) {
      if (!Array.isArray(o.sent)) warn(`${label} : liste des envois illisible, ignorée.`);
      else {
        o.sent.forEach((s: unknown, i: number) => {
          if (!isObj(s) || typeof s.to !== 'string' || s.to.trim() === '') {
            warn(`${label} : envoi n°${i + 1} sans destinataire, ignoré.`);
            return;
          }
          let at = isoOrNull(s.at);
          if (at === null) {
            warn(`${label} : envoi n°${i + 1} sans date lisible, date d'export appliquée.`);
            at = exportedAt;
          }
          sends.push({ recipients: s.to.trim(), sentAt: at });
        });
      }
    }
    const optionalDate = (v: unknown, what: string): string | null => {
      if (v === undefined || v === null) return null;
      const d = isoOrNull(v);
      if (d === null) warn(`${label} : ${what} illisible, ignorée.`);
      return d;
    };
    const project = folderParent(n);
    let previous: string | null = null;
    if (typeof o.prevParent === 'string') {
      const pp = byId.get(o.prevParent);
      if (pp && pp.type === 'folder') previous = pp.id;
      else warn(`${label} : ancien dossier introuvable dans l'export, non repris.`);
    }
    documents.push({
      v1Id: n.id,
      projectV1Id: project ? project.id : ORPHAN_ID,
      previousProjectV1Id: previous,
      kind: kindOfDoc(n, label),
      name: n.name,
      status,
      content: typeof o.content === 'string' ? o.content : '',
      updatedAt,
      validatedAt: optionalDate(o.validatedAt, 'date de validation'),
      archivedAt: optionalDate(o.archivedAt, 'date d\'archivage'),
      sends,
    });
  }

  // --- Projets et dossiers (décision D1 : date du plus ancien livrable contenu, sinon date d'export) ----------------------
  const docsUnder = new Map<string, string[]>(); // dossier -> dates des livrables qu'il contient, à tous les niveaux
  const addUp = (start: Node | null, date: string) => {
    for (let cur = start; cur; cur = folderParent(cur)) {
      const list = docsUnder.get(cur.id) ?? [];
      list.push(date);
      docsUnder.set(cur.id, list);
    }
  };
  for (const d of documents) {
    const holder = byId.get(d.projectV1Id);
    addUp(holder ?? null, d.updatedAt);
  }
  const oldest = (id: string): string => {
    const dates = docsUnder.get(id);
    return dates && dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : exportedAt;
  };
  const kindOf = (n: Node): ProjectKind => (n.obj.archive === true ? 'archive' : n.parent === null ? 'project' : 'folder');

  const projects: ImportProject[] = [];
  const emitted = new Set<string>();
  const folders = nodes.filter((n) => n.type === 'folder');
  const emit = (n: Node) => {
    if (emitted.has(n.id)) return;
    const parent = folderParent(n);
    if (parent) emit(parent); // le parent d'abord (pas de cycle : vérifié plus haut)
    emitted.add(n.id);
    const kind = kindOf(n);
    projects.push({ v1Id: n.id, parentV1Id: parent ? parent.id : n.parent === null ? null : ORPHAN_ID, kind, name: n.name, createdAt: oldest(n.id) });
  };
  const needsOrphanHome = orphanFolders.length + orphanDocs.length > 0;
  if (needsOrphanHome) {
    const dates = [...orphanDocs.map((n) => documents.find((d) => d.v1Id === n.id)!.updatedAt)];
    projects.push({
      v1Id: ORPHAN_ID,
      parentV1Id: null,
      kind: 'project',
      name: ORPHAN_PROJECT_NAME,
      createdAt: dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : exportedAt,
    });
    emitted.add(ORPHAN_ID);
  }
  for (const n of folders) emit(n);

  // --- Réglages --------------------------------------------------------------------------------------------------------
  const settings: ParsedImport['settings'] = [];
  if (state.theme !== undefined) {
    if (typeof state.theme === 'string' && state.theme !== '') settings.push({ key: 'theme', value: state.theme });
    else warn('Le thème est illisible : ignoré.');
  }
  if (state.settings !== undefined) {
    if (!isObj(state.settings)) warn('Les réglages sont illisibles : ignorés.');
    else if (typeof state.settings.author === 'string' && state.settings.author.trim() !== '') settings.push({ key: 'author', value: state.settings.author.trim() });
  }

  // --- Feature flags -----------------------------------------------------------------------------------------------------
  const flags: ImportFlag[] = [];
  const seenFlag = new Set<string>();
  const flagValues = isObj(state.flags) ? state.flags : {};
  if (state.flags !== undefined && !isObj(state.flags)) warn('Les interrupteurs de fonctions sont illisibles : ignorés.');
  if (state.customFlags !== undefined && !Array.isArray(state.customFlags)) warn('Les interrupteurs personnalisés sont illisibles : ignorés.');
  const customs = Array.isArray(state.customFlags) ? state.customFlags : [];
  customs.forEach((c: unknown, i: number) => {
    if (!isObj(c) || typeof c.key !== 'string' || c.key === '') {
      warn(`Interrupteur personnalisé n°${i + 1} sans clé : ignoré.`);
      return;
    }
    if (seenFlag.has(c.key)) return;
    seenFlag.add(c.key);
    const enabled = typeof flagValues[c.key] === 'boolean' ? (flagValues[c.key] as boolean) : c.default === true;
    flags.push({
      key: c.key,
      enabled,
      custom: true,
      label: typeof c.label === 'string' ? c.label : null,
      description: typeof c.desc === 'string' ? c.desc : null,
      group: typeof c.group === 'string' ? c.group : null,
    });
  });
  for (const [key, value] of Object.entries(flagValues)) {
    if (seenFlag.has(key)) continue;
    if (typeof value !== 'boolean') {
      warn(`Interrupteur « ${key} » : valeur illisible, ignoré.`);
      continue;
    }
    seenFlag.add(key);
    flags.push({ key, enabled: value, custom: false, label: null, description: null, group: null });
  }

  // --- Contacts ----------------------------------------------------------------------------------------------------------
  const contacts: ParsedImport['contacts'] = [];
  if (state.stakeholders !== undefined && !Array.isArray(state.stakeholders)) warn('La liste des parties prenantes est illisible : ignorée.');
  const seenEmail = new Set<string>();
  (Array.isArray(state.stakeholders) ? state.stakeholders : []).forEach((s: unknown, i: number) => {
    const email = isObj(s) && typeof s.email === 'string' ? s.email.trim() : '';
    if (!isObj(s) || email === '') {
      warn(`Partie prenante n°${i + 1} sans adresse e-mail : ignorée.`);
      return;
    }
    if (seenEmail.has(email.toLowerCase())) {
      warn(`Partie prenante n°${i + 1} : adresse déjà vue dans l'export, doublon ignoré.`);
      return;
    }
    seenEmail.add(email.toLowerCase());
    contacts.push({ name: typeof s.name === 'string' && s.name.trim() !== '' ? s.name.trim() : email, email });
  });

  // --- Définition de « terminé » (DoD) -----------------------------------------------------------------------------------
  const dod: ParsedImport['dod'] = [];
  if (state.dod !== undefined && !Array.isArray(state.dod)) warn('La définition de « terminé » est illisible : ignorée.');
  (Array.isArray(state.dod) ? state.dod : []).forEach((d: unknown, i: number) => {
    if (!isObj(d) || typeof d.text !== 'string' || d.text.trim() === '') {
      warn(`Critère de « terminé » n°${i + 1} sans texte : ignoré.`);
      return;
    }
    dod.push({ text: d.text, enabled: d.on !== false });
  });

  // --- Bloc-notes ----------------------------------------------------------------------------------------------------------
  let notes: ParsedImport['notes'] = null;
  if (state.notes !== undefined) {
    if (!isObj(state.notes)) warn('Le bloc-notes est illisible : ignoré.');
    else {
      const title = typeof state.notes.title === 'string' ? state.notes.title : '';
      const text = typeof state.notes.text === 'string' ? state.notes.text : '';
      if (title !== '' || text !== '') notes = { title, text };
    }
  }

  // --- Parcours PSPO ----------------------------------------------------------------------------------------------------
  const pspo: ParsedImport['pspo'] = [];
  if (state.pspo !== undefined && !isObj(state.pspo)) warn('Le parcours PSPO est illisible : ignoré.');
  for (const [stepId, v] of Object.entries(isObj(state.pspo) ? state.pspo : {})) {
    if (typeof v !== 'boolean') {
      warn(`Étape PSPO « ${stepId} » : valeur illisible, ignorée.`);
      continue;
    }
    pspo.push({ stepId, done: v });
  }

  // --- Reconnaissance d'un export qui ne contient que les données d'exemple (décision D4) ----------------------------------
  let sampleOnly = nodes.length > 0 && nodes.every((n) => SEED_NAMES.has(n.name));
  if (sampleOnly) {
    for (const d of documents) {
      if (d.sends.length > 0 || (await sha256Text(d.content)) !== SEED_DOC_SHA256) sampleOnly = false;
    }
  }

  return {
    fileSha256: input.sha256,
    exportedAt,
    generator,
    projects,
    documents,
    settings,
    flags,
    contacts,
    dod,
    notes,
    pspo,
    sampleOnly,
    warnings,
  };
}
