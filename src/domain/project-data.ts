// Données d'un projet telles que les lit le générateur de livrables (lot M8). Types purs : aucune lecture de base ici.
// Placé dans domain/ pour que le lecteur (data/) et le générateur (export/) le partagent sans dépendre l'un de l'autre.
// Les champs propres à chaque type (table d'extension) sont réunis dans `d`, sous les noms de colonnes de la base.
import type { ItemKind } from './kinds.ts';

export interface DItem {
  id: number;
  kind: ItemKind;
  code: string;
  title: string;
  description: string;
  status: string;
  /** Champs de la table d'extension du type (texte ; vide si le type n'en a pas). */
  d: Readonly<Record<string, string>>;
}

export interface DLink {
  type: string;
  fromId: number;
  toId: number;
}

export interface ProjectData {
  projectName: string;
  items: readonly DItem[];
  links: readonly DLink[];
}
