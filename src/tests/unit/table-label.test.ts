import { describe, expect, test } from 'vitest';

import * as Judging from '@/lib/judging';

describe('formatOrdinal', () => {
  test('latin letters continue past Z as AA, AB…', () => {
    expect([1, 2, 26, 27, 28, 52, 53, 702, 703].map((n) => Judging.formatOrdinal(n, 'latin'))).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });

  test('roman numerals use subtractive forms', () => {
    expect([1, 4, 9, 14, 40, 90, 400, 1994, 3999].map((n) => Judging.formatOrdinal(n, 'roman'))).toEqual([
      'I',
      'IV',
      'IX',
      'XIV',
      'XL',
      'XC',
      'CD',
      'MCMXCIV',
      'MMMCMXCIX',
    ]);
  });

  test('arabic numerals are plain numbers', () => {
    expect(Judging.formatOrdinal(42, 'arabic')).toBe('42');
  });

  test('rejects non-positive input', () => {
    expect(() => Judging.formatOrdinal(0, 'arabic')).toThrow(RangeError);
    expect(() => Judging.formatOrdinal(1.5, 'latin')).toThrow(RangeError);
  });
});

describe('formatTableLabel', () => {
  test('one row is a plain 1-based number by default', () => {
    expect([0, 1, 9, 99].map((slot) => Judging.formatTableLabel(slot, Judging.DEFAULT_TABLE_LAYOUT))).toEqual([
      '1',
      '2',
      '10',
      '100',
    ]);
  });

  test('one row uses only the column alphabet', () => {
    const layout = {
      ...Judging.DEFAULT_TABLE_LAYOUT,
      columnAlphabet: 'latin' as const,
    };
    expect(Judging.formatTableLabel(26, layout)).toBe('AA');
  });

  test('fills column by column across the rows', () => {
    const layout = {
      rows: 3,
      rowAlphabet: 'latin' as const,
      columnAlphabet: 'arabic' as const,
    };
    expect([0, 1, 2, 3, 4, 5, 6].map((slot) => Judging.formatTableLabel(slot, layout))).toEqual([
      'A1',
      'B1',
      'C1',
      'A2',
      'B2',
      'C2',
      'A3',
    ]);
  });

  test('joins letters and numbers directly, hyphenates everything else', () => {
    const label = (rowAlphabet: 'latin' | 'arabic' | 'roman', columnAlphabet: 'latin' | 'arabic' | 'roman') =>
      Judging.formatTableLabel(4, { rows: 2, rowAlphabet, columnAlphabet });
    // Slot 4 with 2 rows: row 1, column 3.
    expect(label('latin', 'arabic')).toBe('A3');
    expect(label('arabic', 'latin')).toBe('1C');
    expect(label('roman', 'arabic')).toBe('I-3');
    expect(label('latin', 'roman')).toBe('A-III');
    expect(label('arabic', 'arabic')).toBe('1-3');
    expect(label('latin', 'latin')).toBe('A-C');
    expect(label('roman', 'roman')).toBe('I-III');
  });

  test('rejects negative slots', () => {
    expect(() => Judging.formatTableLabel(-1, Judging.DEFAULT_TABLE_LAYOUT)).toThrow(RangeError);
  });
});
