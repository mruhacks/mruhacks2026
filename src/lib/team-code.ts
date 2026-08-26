/**
 * Team join-code generation: an 8-character alphanumeric code, unique per
 * event, checked against a leetspeak-normalized profanity denylist and
 * re-rolled (never censored/replaced) on a hit.
 */

import { randomInt } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import type { db as dbSingleton } from '@/utils/db';
import { teams } from '@/db/schema';

/** Accepts either the db singleton or a transaction handle from db.transaction(). */
type Queryable = Pick<typeof dbSingleton, 'select'>;
import { EN_BAD_WORDS } from '@/lib/profanity-wordlists/en';
import { FR_BAD_WORDS } from '@/lib/profanity-wordlists/fr';

export const TEAM_CODE_LENGTH = 8;

// Digits 2-9 plus A-Z minus I/L/O: excludes 0/O and 1/I/L to avoid visual ambiguity.
export const TEAM_CODE_CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const TEAM_CODE_MAX_ATTEMPTS = 25;

const DENYLIST = [...EN_BAD_WORDS, ...FR_BAD_WORDS];

const LEETSPEAK_SUBSTITUTIONS: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  $: 's',
  '@': 'a',
};

/** Lowercases and reverses common leetspeak substitutions, e.g. "4$$" -> "ass". */
export function normalizeLeetspeak(input: string): string {
  return input
    .toLowerCase()
    .split('')
    .map((char) => LEETSPEAK_SUBSTITUTIONS[char] ?? char)
    .join('');
}

/**
 * Detects (never censors) whether a candidate code contains a denylisted
 * word once leetspeak substitutions are normalized away. A hit should
 * trigger regenerating a new candidate, not modifying this one.
 */
export function isCodeDenylisted(code: string): boolean {
  const normalized = normalizeLeetspeak(code);
  return DENYLIST.some((word) => normalized.includes(word));
}

/** Generates a random 8-char code from the restricted charset, no checks applied. */
export function generateRawTeamCode(): string {
  let code = '';
  for (let i = 0; i < TEAM_CODE_LENGTH; i++) {
    code += TEAM_CODE_CHARSET[randomInt(0, TEAM_CODE_CHARSET.length)];
  }
  return code;
}

/**
 * Generates a team code that is clean (denylist) and unique for the given
 * event, retrying on either a denylist hit or an active-code collision.
 * Accepts a `db` or transaction handle so callers can generate the code
 * inside the same transaction that inserts the `teams` row.
 */
export async function generateTeamCode(
  eventId: string,
  db: Queryable,
): Promise<string> {
  for (let attempt = 0; attempt < TEAM_CODE_MAX_ATTEMPTS; attempt++) {
    const candidate = generateRawTeamCode();
    if (isCodeDenylisted(candidate)) continue;

    const [existing] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.eventId, eventId), eq(teams.code, candidate)))
      .limit(1);

    if (!existing) return candidate;
  }

  throw new Error(
    `Failed to generate a unique team code for event ${eventId} after ${TEAM_CODE_MAX_ATTEMPTS} attempts.`,
  );
}
