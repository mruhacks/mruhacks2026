import { afterEach, describe, test, expect, vi } from 'vitest';

// randomInt picks each character's charset index; tests can queue up codes
// for it to roll before it falls back to real randomness.
const queuedIndices = vi.hoisted(() => [] as number[]);
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomInt: (min: number, max: number) => queuedIndices.shift() ?? actual.randomInt(min, max),
  };
});

import { generateTeamCode } from '@/lib/team-code';
import { TEAM_CODE_CHARSET, TEAM_CODE_LENGTH } from '@/lib/team-code-constants';

type Queryable = Parameters<typeof generateTeamCode>[1];

/** A db handle on which no team holds any code, so every clean roll is accepted. */
const noTeams = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
} as unknown as Queryable;

/** Makes the generator roll `codes`, in order, before anything random. */
function roll(...codes: string[]) {
  for (const code of codes) {
    for (const char of code) queuedIndices.push(TEAM_CODE_CHARSET.indexOf(char));
  }
}

const generate = () => generateTeamCode('event-id', noTeams);

afterEach(() => {
  queuedIndices.length = 0;
});

describe('generateTeamCode', () => {
  test('generates a code of the configured length', async () => {
    expect(await generate()).toHaveLength(TEAM_CODE_LENGTH);
  });

  test('only uses characters from the restricted charset', async () => {
    for (const char of await generate()) {
      expect(TEAM_CODE_CHARSET).toContain(char);
    }
  });

  test('excludes visually ambiguous characters', () => {
    for (const ambiguous of ['0', 'O', '1', 'I', 'L']) {
      expect(TEAM_CODE_CHARSET).not.toContain(ambiguous);
    }
  });

  test('produces varied output across calls', async () => {
    const codes = new Set(await Promise.all(Array.from({ length: 20 }, generate)));
    expect(codes.size).toBeGreaterThan(1);
  });

  test('keeps a clean code', async () => {
    roll('7GH3KM9P');
    expect(await generate()).toBe('7GH3KM9P');
  });

  test.each([
    ['an English bad word', 'XFUCKYZW'],
    ['a French bad word', 'XMERDEYW'],
    ['a leetspeak-obfuscated bad word', 'X4SSYZWQ'],
  ])('re-rolls a code containing %s', async (_name, profane) => {
    roll(profane, '7GH3KM9P');
    expect(await generate()).toBe('7GH3KM9P');
  });

  test('re-rolls a code already taken in the event', async () => {
    roll('7GH3KM9P', 'ABCDEFGH');
    let lookups = 0;
    const takenOnce = {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => (lookups++ === 0 ? [{ id: 't' }] : []) }) }),
      }),
    } as unknown as Queryable;
    expect(await generateTeamCode('event-id', takenOnce)).toBe('ABCDEFGH');
  });
});
