import { describe, test, expect } from 'vitest';
import {
  normalizeLeetspeak,
  isCodeDenylisted,
  generateRawTeamCode,
  TEAM_CODE_LENGTH,
  TEAM_CODE_CHARSET,
} from '@/lib/team-code';

describe('normalizeLeetspeak', () => {
  test('lowercases input', () => {
    expect(normalizeLeetspeak('ABC')).toBe('abc');
  });

  test('substitutes common leetspeak characters', () => {
    expect(normalizeLeetspeak('4$$')).toBe('ass');
    expect(normalizeLeetspeak('5H1T')).toBe('shit');
    expect(normalizeLeetspeak('3')).toBe('e');
  });

  test('leaves already-clean text unchanged aside from case', () => {
    expect(normalizeLeetspeak('HELLO')).toBe('hello');
  });
});

describe('isCodeDenylisted', () => {
  test('flags a code containing an English bad word', () => {
    expect(isCodeDenylisted('XFUCKYZ')).toBe(true);
  });

  test('flags a code containing a French bad word', () => {
    expect(isCodeDenylisted('XMERDEY')).toBe(true);
  });

  test('flags leetspeak-obfuscated bad words', () => {
    expect(isCodeDenylisted('X4SSYZW')).toBe(true);
  });

  test('is case-insensitive', () => {
    expect(isCodeDenylisted('xfuckyz')).toBe(true);
  });

  test('does not flag a clean code', () => {
    expect(isCodeDenylisted('7GH3KM9P')).toBe(false);
  });
});

describe('generateRawTeamCode', () => {
  test('generates a code of the configured length', () => {
    expect(generateRawTeamCode()).toHaveLength(TEAM_CODE_LENGTH);
  });

  test('only uses characters from the restricted charset', () => {
    const code = generateRawTeamCode();
    for (const char of code) {
      expect(TEAM_CODE_CHARSET).toContain(char);
    }
  });

  test('excludes visually ambiguous characters', () => {
    for (const ambiguous of ['0', 'O', '1', 'I', 'L']) {
      expect(TEAM_CODE_CHARSET).not.toContain(ambiguous);
    }
  });

  test('produces varied output across calls', () => {
    const codes = new Set(Array.from({ length: 20 }, generateRawTeamCode));
    expect(codes.size).toBeGreaterThan(1);
  });
});
