/** Keep optional number inputs empty across registration, resets, and edits. */
export function parseOptionalNumber(
  value: string | number | null | undefined,
): number | null {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    return null;
  }
  // Preserve zero and invalid numbers so the field's schema can reject them
  // where appropriate, rather than treating them as an omitted value.
  return Number(value);
}
