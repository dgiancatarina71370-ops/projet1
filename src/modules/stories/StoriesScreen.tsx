// Écran « User stories » (converti au lot M8b) : la mécanique commune est dans shared/register-screen.tsx ; ce fichier fournit la configuration propre à ce type.
import { commonItemOps } from '../../data/repositories/register-ops.ts';
import { createStory, listStories, updateStory } from '../../data/repositories/stories.ts';
import type { Story } from '../../data/repositories/stories.ts';
import { RegisterScreen } from '../../shared/register-screen.tsx';
import type { RegisterConfig } from '../../shared/register-screen.tsx';
import type { LinksSlot } from '../../shared/ui.tsx';
import { StoryDetailView, StoryFormView, StoryListView } from './StoriesView.tsx';
import { EMPTY_STORY_FORM, validateStoryForm } from './logic.ts';
import type { StoryForm, StoryFormResult } from './logic.ts';

type Valid = Extract<StoryFormResult, { ok: true }>;

const CONFIG: RegisterConfig<Story, StoryForm, Valid> = {
  title: 'User stories',
  what: 'Les user stories',
  kind: 'story',
  gone: "Cette user story n'existe plus.",
  createHeading: 'Nouvelle user story',
  editHeading: "Modifier la user story",
  emptyForm: EMPTY_STORY_FORM,
  formFrom: (row) => ({ title: row.title, description: row.description, role: row.role, goal: row.goal, benefit: row.benefit, criteria: row.criteria }),
  validate: validateStoryForm,
  ops: {
    list: listStories,
    create: async (projectId, v) => (await createStory({ projectId, title: v.title, description: v.description, ...v.fields })).id,
    update: (id, v) => updateStory(id, { title: v.title, description: v.description, fields: v.fields }),
    ...commonItemOps,
  },
  ListView: StoryListView,
  DetailView: StoryDetailView,
  FormView: StoryFormView,
};

export function StoriesScreen(props: { projectId: number | null; projectName: string; onGoToProjects: () => void; onChanged: () => void; renderLinks?: LinksSlot; openId?: number | null; onOpenHandled?: () => void }) {
  return <RegisterScreen config={CONFIG} {...props} />;
}
