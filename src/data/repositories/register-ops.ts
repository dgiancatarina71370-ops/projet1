// Accès aux données communs aux écrans de registre (lot M8b) : changement de statut, suppression, nombre de liens d'un élément.
// Les écrans les passent à `RegisterScreen` (shared/) dans leur configuration : la couche shared n'importe pas data (règle R4).
import { changeItemStatus, deleteItem } from './items.ts';
import { linksOfItem } from './links.ts';

export const commonItemOps = {
  setStatus: changeItemStatus,
  remove: deleteItem,
  countLinks: async (id: number): Promise<number> => (await linksOfItem(id)).length,
};
