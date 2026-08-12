import { z } from 'zod';

export const suggestionTasks = ['classify_notes', 'refine_bullet', 'review_dates', 'flag_duplicates', 'refine_existing_summary'];
export const destinations = ['contact', 'summary', 'employment', 'education', 'qualifications', 'skills', 'additional', 'unclassified'];

const fragmentSchema = z.object({ id: z.string().min(1).max(120), text: z.string().min(1).max(4000) }).strict();
const contextSchema = z.string().max(1000).optional();
const requestBase = z.object({ fragments: z.array(fragmentSchema).min(1).max(8), context: contextSchema });
const variants = suggestionTasks.map((task) => requestBase.extend({ task: z.literal(task) }).strict());
export const suggestionRequestSchema = z.discriminatedUnion('task', variants).superRefine((value, ctx) => {
  if (new Set(value.fragments.map(({ id }) => id)).size !== value.fragments.length) ctx.addIssue({ code: 'custom', message: 'Fragment IDs must be unique.' });
  const total = value.fragments.reduce((count, item) => count + item.text.length, value.context?.length ?? 0);
  if (total > 12000) ctx.addIssue({ code: 'custom', message: 'Selected text exceeds 12,000 characters.' });
});

const baseSuggestion = { fragmentId: z.string().min(1).max(120), reason: z.string().min(1).max(500), confidence: z.enum(['high', 'medium', 'low']), warnings: z.array(z.string().max(300)).max(5) };
const responseByTask = {
  classify_notes: z.object({ ...baseSuggestion, destination: z.enum(destinations), proposedText: z.string().min(1).max(4000).optional() }).strict(),
  refine_bullet: z.object({ ...baseSuggestion, proposedText: z.string().min(1).max(4000) }).strict(),
  refine_existing_summary: z.object({ ...baseSuggestion, proposedText: z.string().min(1).max(4000) }).strict(),
  review_dates: z.object({ ...baseSuggestion, flags: z.array(z.string().min(1).max(300)).min(1).max(5) }).strict(),
  flag_duplicates: z.object({ ...baseSuggestion, duplicateFragmentIds: z.array(z.string().min(1).max(120)).min(1).max(7) }).strict(),
};
export const responseSchemasByTask = Object.fromEntries(suggestionTasks.map((task) => [task, z.object({ task: z.literal(task), suggestions: z.array(responseByTask[task]).max(8) }).strict()]));
export const suggestionResponseSchema = z.discriminatedUnion('task', Object.values(responseSchemasByTask));
export const contractFixtures = { validRequest: { task: 'refine_bullet', fragments: [{ id: 'fragment-1', text: 'Managed the team' }] }, validResponse: { task: 'refine_bullet', suggestions: [{ fragmentId: 'fragment-1', proposedText: 'Managed the team', reason: 'Already starts with an action verb.', confidence: 'high', warnings: [] }] } };
