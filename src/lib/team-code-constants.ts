/**
 * Team-code constants, split out of `@/lib/team-code` so client components
 * can import them without pulling in that module's `node:crypto` dependency.
 */

export const TEAM_CODE_LENGTH = 8;

// Digits 2-9 plus A-Z minus I/L/O: excludes 0/O and 1/I/L to avoid visual ambiguity.
export const TEAM_CODE_CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
