// Création du projet d'exemple (lot M9, décisions D107 et D108). Aucun chemin d'écriture nouveau : tout passe par les dépôts existants,
// donc par leurs validations, leurs codes (séquences) et leur journal. Le projet créé est indiscernable d'un projet saisi à la main.
// Les données viennent de src/domain/sample-project.ts (pures). En cas d'échec en cours de route, le projet partiel est supprimé (D108).
import { SAMPLE_ITEMS, SAMPLE_LINKS, SAMPLE_PROJECT_NAME } from '../../domain/sample-project.ts';
import type { SampleItem, SampleLink } from '../../domain/sample-project.ts';
import { query } from '../db.ts';
import { changeItemStatus, createItem } from './items.ts';
import { createLink } from './links.ts';
import { createDecision } from './decisions.ts';
import { createRequirement } from './requirements.ts';
import { createRisk } from './risks.ts';
import { createStakeholder } from './stakeholders.ts';
import { createStory } from './stories.ts';
import { createTestCase } from './testcases.ts';
import { createWorkshop } from './workshops.ts';
import { createProject, deleteProject } from './projects.ts';

export interface SampleSource {
  items: readonly SampleItem[];
  links: readonly SampleLink[];
}

export interface SampleResult {
  projectId: number;
  items: number;
  links: number;
}

/** Identifiant du projet d'exemple s'il existe déjà (même nom, projet de premier niveau ou non), sinon null. */
export async function findSampleProject(): Promise<number | null> {
  const rows = await query<{ id: number }>("SELECT id FROM projects WHERE kind = 'project' AND name = ? ORDER BY id LIMIT 1", [SAMPLE_PROJECT_NAME]);
  return rows.length > 0 ? rows[0].id : null;
}

async function createOne(projectId: number, item: SampleItem): Promise<{ id: number; code: string }> {
  const base = { projectId, title: item.title, description: item.description };
  switch (item.kind) {
    case 'stakeholder': return createStakeholder({ ...base, ...item.fields });
    case 'need': return createItem({ ...base, kind: 'need' });
    case 'requirement': return createRequirement({ ...base, ...item.fields });
    case 'decision': return createDecision({ ...base, ...item.fields });
    case 'risk': return createRisk({ ...base, ...item.fields });
    case 'story': return createStory({ ...base, ...item.fields });
    case 'test': return createTestCase({ ...base, ...item.fields });
    case 'workshop': return createWorkshop({ ...base, ...item.fields });
  }
}

/**
 * Crée le projet d'exemple. Refuse un doublon. `source` n'est fourni que par les tests (pour simuler un échec) : l'application utilise le jeu officiel.
 * Si une étape échoue, tout ce qui a été créé est supprimé et l'erreur est relancée avec un message clair.
 */
export async function createSampleProject(source: SampleSource = { items: SAMPLE_ITEMS, links: SAMPLE_LINKS }): Promise<SampleResult> {
  if ((await findSampleProject()) !== null) throw new Error(`Le projet d'exemple existe déjà (« ${SAMPLE_PROJECT_NAME} »). Supprimez-le d'abord si vous voulez le recréer.`);
  const projectId = await createProject(SAMPLE_PROJECT_NAME);
  try {
    const ids = new Map<string, number>();
    for (const item of source.items) {
      const created = await createOne(projectId, item);
      // Le lien entre les données et la base repose sur le code : s'il diffère, les liens pointeraient au mauvais endroit.
      if (created.code !== item.key) throw new Error(`Le code attribué à « ${item.title} » est ${created.code} au lieu de ${item.key}.`);
      ids.set(item.key, created.id);
    }
    for (const item of source.items) await changeItemStatus(ids.get(item.key) as number, item.status);
    for (const link of source.links) {
      const fromId = ids.get(link.from);
      const toId = ids.get(link.to);
      if (fromId === undefined || toId === undefined) throw new Error(`Lien inconnu : ${link.from} ${link.type} ${link.to}.`);
      await createLink({ type: link.type, fromId, toId });
    }
    return { projectId, items: source.items.length, links: source.links.length };
  } catch (e) {
    let cleanup = '';
    try {
      await deleteProject(projectId);
    } catch (e2) {
      cleanup = ` Le projet partiel n'a pas pu être supprimé : ${e2 instanceof Error ? e2.message : String(e2)}`;
    }
    throw new Error(`Création du projet d'exemple impossible : ${e instanceof Error ? e.message : String(e)}.${cleanup}`);
  }
}
