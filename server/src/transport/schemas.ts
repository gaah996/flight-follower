import { z } from 'zod';

export const SettingsBodySchema = z.object({
  simbriefUserId: z.string().nullable(),
});
