import { z } from 'zod';
import { TEAM_CODE_LENGTH } from '@/lib/team-code';

export const joinTeamSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .length(TEAM_CODE_LENGTH, `Code must be ${TEAM_CODE_LENGTH} characters`)
    .regex(/^[A-Z0-9]+$/, 'Code must be alphanumeric'),
});

export type JoinTeamInput = z.infer<typeof joinTeamSchema>;
