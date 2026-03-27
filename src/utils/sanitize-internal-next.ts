/**
 * Normalizes `searchParams.next` and returns a safe same-origin path, or undefined.
 */
export function sanitizeInternalNextPath(
  raw: string | string[] | undefined | null,
): string | undefined {
  if (raw == null) return undefined;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== 'string' || !s) return undefined;
  // Reject before trim so trailing CRLF cannot become a valid path after trim.
  if (/[\r\n\\]/.test(s)) return undefined;
  const trimmed = s.trim();
  if (!trimmed.startsWith('/')) return undefined;
  if (trimmed.startsWith('//')) return undefined;
  if (trimmed.toLowerCase().startsWith('javascript:')) return undefined;
  return trimmed;
}
