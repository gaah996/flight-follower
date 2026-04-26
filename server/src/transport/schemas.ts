import { z } from 'zod';

export const SettingsBodySchema = z.object({
  simbriefUserId: z.string().nullable(),
});

export const ResetBodySchema = z.object({
  scope: z.enum(['aircraft', 'plan', 'all']),
});

export type ResetScope = z.infer<typeof ResetBodySchema>['scope'];
