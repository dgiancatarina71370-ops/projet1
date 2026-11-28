// Écran « Ateliers » (lot M7, converti au lot M8b) : la mécanique commune est dans shared/register-screen.tsx ; ce fichier fournit la configuration propre aux ateliers.
import { commonItemOps } from '../../data/repositories/register-ops.ts';
import { createWorkshop, listWorkshops, updateWorkshop } from '../../data/repositories/workshops.ts';
import type { Workshop } from '../../data/repositories/workshops.ts';
import { RegisterScreen } from '../../shared/register-screen.tsx';
import type { RegisterConfig } from '../../shared/register-screen.tsx';
import type { HistorySlot, LinksSlot } from '../../shared/ui.tsx';
import { WorkshopDetailView, WorkshopFormView, WorkshopListView } from './WorkshopsView.tsx';
import { EMPTY_WORKSHOP_FORM, validateWorkshopForm } from './logic.ts';
import type { WorkshopForm, WorkshopFormResult } from './logic.ts';

type Valid = Extract<WorkshopFormResult, { ok: true }>;
type DetailExtra = { onExportReport?: () => void };

const CONFIG: RegisterConfig<Workshop, WorkshopForm, Valid, DetailExtra> = {
  title: 'Ateliers',
  what: 'Les ateliers',
  kind: 'workshop',
  gone: "Cet atelier n'existe plus.",
  createHeading: 'Nouvel atelier',
  editHeading: "Modifier l'atelier",
  emptyForm: EMPTY_WORKSHOP_FORM,
  formFrom: (row) => ({ title: row.title, description: row.description, heldOn: row.held_on, place: row.place, objective: row.objective, notes: row.notes, followUp: row.follow_up }),
  validate: validateWorkshopForm,
  ops: {
    list: listWorkshops,
    create: async (projectId, v) => (await createWorkshop({ projectId, title: v.title, description: v.description, ...v.fields })).id,
    update: (id, v) => updateWorkshop(id, { title: v.title, description: v.description, fields: v.fields }),
    ...commonItemOps,
  },
  ListView: WorkshopListView,
  DetailView: WorkshopDetailView,
  FormView: WorkshopFormView,
};

export function WorkshopsScreen(props: { projectId: number | null; projectName: string; onGoToProjects: () => void; onChanged: () => void; renderLinks?: LinksSlot; renderHistory?: HistorySlot; openId?: number | null; onOpenHandled?: () => void; onExportReport?: (workshopId: number) => void }) {
  const { onExportReport, ...common } = props;
  // Le bouton « Exporter le compte rendu » (D92) n'existe que si l'application fournit l'action.
  return <RegisterScreen config={CONFIG} {...common} detailExtra={(row) => ({ onExportReport: onExportReport ? () => onExportReport(row.id) : undefined })} />;
}
