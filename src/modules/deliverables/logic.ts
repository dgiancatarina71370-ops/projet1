// Logique pure de l'écran « Livrables » (lot M8) : choix du modèle, de l'atelier, messages. Sans base ni React.
import { statusLabel } from '../../domain/kinds.ts';
import { MODELS, modelInfo } from '../../export/deliverables/models.ts';
import type { ModelId, ModelInfo } from '../../export/deliverables/models.ts';
import type { DItem } from '../../domain/project-data.ts';

/** Modèle proposé à l'ouverture de l'écran : un registre, qui ne demande aucun choix préalable. */
export const DEFAULT_MODEL: ModelId = 'requirements';

export const MODEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = MODELS.map((m) => ({ value: m.id, label: m.label }));

/** Texte du choix « aucun atelier choisi ». */
export const NO_WORKSHOP_VALUE = '';

/** Ateliers proposés (tous, archivés compris : on choisit explicitement celui dont on veut le compte rendu), par code. */
export function workshopChoices(items: readonly DItem[]): Array<{ value: string; label: string }> {
  const list = items
    .filter((i) => i.kind === 'workshop')
    .sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }))
    .map((w) => ({ value: String(w.id), label: `${w.code} — ${w.title} (${statusLabel(w.status, 'workshop')})` }));
  return [{ value: NO_WORKSHOP_VALUE, label: '— Choisir un atelier —' }, ...list];
}

/** Ce qui empêche de générer, en une phrase ; chaîne vide quand tout est prêt. */
export function selectionProblem(model: ModelInfo | null, workshopValue: string, workshopCount: number): string {
  if (model === null) return 'Choisissez un modèle de livrable.';
  if (model.needsWorkshop && workshopCount === 0) return "Ce projet n'a encore aucun atelier : créez-en un dans l'écran Ateliers.";
  if (model.needsWorkshop && workshopValue === NO_WORKSHOP_VALUE) return 'Choisissez un atelier.';
  return '';
}

/** Phrase sous la case « archivés ou rejetés ». */
export function archiveNote(model: ModelInfo | null): string {
  if (model !== null && !model.usesArchiveOption) return 'Sans effet sur la matrice de traçabilité : elle ignore toujours les éléments archivés ou rejetés.';
  return 'Décochée : seuls les éléments actifs figurent dans le document.';
}

export const modelOf = (value: string): ModelInfo | null => modelInfo(value);

/** Résultat d'un enregistrement (lot F5, F5-D05) : ce que l'utilisateur doit savoir, en une phrase. */
export function savedMessage(result: { outcome: 'created'; version: number; replacedVersion: number | null } | { outcome: 'identical'; version: number }): string {
  if (result.outcome === 'identical') return `Contenu identique à la version ${result.version} : aucune nouvelle version.`;
  if (result.replacedVersion === null) return `Document enregistré : version ${result.version} (brouillon).`;
  return `Version ${result.version} enregistrée ; la version ${result.replacedVersion} est remplacée.`;
}
