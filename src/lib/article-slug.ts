/**
 * Slug helpers for event wiki articles.
 *
 * Articles are addressed by `/dashboard/events/<eventId>/wiki/<slug>`, so the
 * slug has to survive being pasted into a URL untouched: lowercase ASCII,
 * digits and single hyphens only. Slugs are unique per event, not globally —
 * two events may each have a `schedule` article.
 */

export const ARTICLE_SLUG_MAX_LENGTH = 120;

/**
 * Derives a URL-safe slug from an article title. Returns an empty string when
 * the title has nothing sluggable in it (e.g. it is entirely punctuation or
 * non-Latin script) — callers must fall back rather than store an empty slug.
 */
export function slugifyArticleTitle(title: string): string {
  return (
    title
      .normalize('NFKD')
      // Strip combining marks so "Café" slugs as "cafe" instead of "caf".
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, ARTICLE_SLUG_MAX_LENGTH)
      // The slice can leave a trailing hyphen behind when it lands mid-word.
      .replace(/-+$/, '')
  );
}

export function isValidArticleSlug(slug: string): boolean {
  return (
    slug.length > 0 &&
    slug.length <= ARTICLE_SLUG_MAX_LENGTH &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  );
}

/**
 * Returns `base` if it is free, otherwise the first `base-2`, `base-3`, …
 * that isn't taken. Suffixes are trimmed back into the length budget so the
 * result always stays a valid slug.
 */
export function uniqueArticleSlug(
  base: string,
  taken: Iterable<string>,
): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;

  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const trimmed = base
      .slice(0, ARTICLE_SLUG_MAX_LENGTH - suffix.length)
      .replace(/-+$/, '');
    const candidate = `${trimmed}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
