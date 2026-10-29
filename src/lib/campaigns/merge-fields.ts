/**
 * Merge fields in campaign subjects and bodies. v1 supports exactly one:
 *
 *   {{firstName}}            → the recipient's first name, or "there"
 *   {{firstName|friend}}     → … or a fallback of the author's choosing
 *
 * Anything else in double braces is an error the author has to fix before the
 * campaign can be saved or sent, rather than something that silently goes
 * out as literal text.
 */

const MERGE_FIELD_PATTERN = /\{\{\s*([^{}|]*?)\s*(?:\|\s*([^{}]*?)\s*)?\}\}/g;

const DEFAULT_FIRST_NAME_FALLBACK = 'there';
const KNOWN_FIELDS = new Set(['firstName']);

/** Every distinct `{{…}}` in `text` that isn't a supported merge field, as written. */
function findUnknownMergeFields(text: string): string[] {
  const unknown = new Set<string>();
  for (const match of text.matchAll(MERGE_FIELD_PATTERN)) {
    if (!KNOWN_FIELDS.has(match[1] ?? '')) unknown.add(match[0]);
  }
  // A lone `{{` or `}}` (e.g. a half-typed field) is also a mistake.
  const stripped = text.replace(MERGE_FIELD_PATTERN, '');
  if (stripped.includes('{{') || stripped.includes('}}')) {
    unknown.add(stripped.includes('{{') ? '{{' : '}}');
  }
  return [...unknown];
}

/** The inline error for `text`, or null when every merge field is supported. */
export function mergeFieldError(text: string): string | null {
  const unknown = findUnknownMergeFields(text);
  if (unknown.length === 0) return null;
  return `Unknown merge field${unknown.length === 1 ? '' : 's'} ${unknown.join(', ')}. Only {{firstName}} is supported (optionally {{firstName|fallback}}).`;
}

/** First word of a display name, or null when there isn't one. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

const MARKDOWN_SPECIAL = /[\\`*_{}[\]()#+\-.!<>|~]/g;

/**
 * Substitutes merge fields. `escapeMarkdown` backslash-escapes the inserted
 * value, so a name like `*Bob*` reads as itself instead of as formatting when
 * the result is parsed as markdown.
 */
export function applyMergeFields(
  text: string,
  values: { firstName: string | null },
  options: { escapeMarkdown?: boolean } = {},
): string {
  return text.replace(MERGE_FIELD_PATTERN, (whole, field, fallback) => {
    if (field !== 'firstName') return whole;
    const value = values.firstName || fallback || DEFAULT_FIRST_NAME_FALLBACK;
    return options.escapeMarkdown ? value.replace(MARKDOWN_SPECIAL, (c: string) => `\\${c}`) : value;
  });
}
