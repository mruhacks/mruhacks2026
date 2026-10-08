/**
 * Expo table labels: a submission stores a sequential `table_slot` (0-based,
 * assigned once at first publish, see `assignTableSlot`), and the label is
 * derived from it and the event's layout here, in one place.
 *
 * Slots fill column by column: with 3 rows, slots 0, 1, 2 are A1, B1, C1 and
 * slot 3 is A2. Only the row count is configured — every row grows at the
 * same rate as projects are added, so a label never changes once assigned
 * (unless an organizer changes the layout itself).
 *
 * With a single row the label is just the column ordinal: "1", "2", … by
 * default. Otherwise it's row then column, joined directly when one side is
 * Latin letters and the other Arabic numerals ("B3", "3B"), and with a
 * hyphen whenever the boundary would be ambiguous ("II-4", "B-IV", "2-4").
 */

export const TABLE_ALPHABETS = ['latin', 'arabic', 'roman'] as const;
export type TableAlphabet = (typeof TABLE_ALPHABETS)[number];

export const TABLE_ALPHABET_LABELS: Record<TableAlphabet, string> = {
  latin: 'Letters (A, B, C…)',
  arabic: 'Numbers (1, 2, 3…)',
  roman: 'Roman numerals (I, II, III…)',
};

export type TableLayout = {
  rows: number;
  rowAlphabet: TableAlphabet;
  columnAlphabet: TableAlphabet;
};

export const DEFAULT_TABLE_LAYOUT: TableLayout = {
  rows: 1,
  rowAlphabet: 'latin',
  columnAlphabet: 'arabic',
};

export const MAX_TABLE_ROWS = 100;

const ROMAN: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** `n` (1-based) in the given alphabet: 28 → "AB", "28", "XXVIII". */
export function formatOrdinal(n: number, alphabet: TableAlphabet): string {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`Ordinal must be a positive integer, got ${n}`);
  }
  switch (alphabet) {
    case 'arabic':
      return String(n);
    case 'latin': {
      // Bijective base 26: Z is followed by AA, not BA.
      let out = '';
      for (let rest = n; rest > 0; rest = Math.floor((rest - 1) / 26)) {
        out = String.fromCharCode(65 + ((rest - 1) % 26)) + out;
      }
      return out;
    }
    case 'roman': {
      // Past 3999 the M's just keep repeating.
      let out = '';
      let rest = n;
      for (const [value, symbol] of ROMAN) {
        for (; rest >= value; rest -= value) out += symbol;
      }
      return out;
    }
  }
}

function separator(row: TableAlphabet, column: TableAlphabet): string {
  const kinds = new Set([row, column]);
  return kinds.has('latin') && kinds.has('arabic') ? '' : '-';
}

/** The label for a 0-based table slot under `layout`. */
export function formatTableLabel(slot: number, layout: TableLayout): string {
  if (!Number.isInteger(slot) || slot < 0) {
    throw new RangeError(
      `Table slot must be a non-negative integer, got ${slot}`,
    );
  }
  const rows = Math.max(1, Math.floor(layout.rows));
  const column = formatOrdinal(
    Math.floor(slot / rows) + 1,
    layout.columnAlphabet,
  );
  if (rows === 1) return column;
  const row = formatOrdinal((slot % rows) + 1, layout.rowAlphabet);
  return row + separator(layout.rowAlphabet, layout.columnAlphabet) + column;
}
