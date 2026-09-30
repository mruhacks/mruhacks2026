/**
 * Slug helpers shared by everything addressed by a URL segment — event wiki
 * articles (`/dashboard/events/<eventId>/wiki/<slug>`) and an event's own
 * custom slug (`/dashboard/events/<slug>`, see `@/lib/event-slug`).
 *
 * A slug has to survive being pasted into a URL untouched: lowercase ASCII,
 * digits and single hyphens only. Uniqueness scope is the caller's business —
 * article slugs are unique per event (two events may each have a `schedule`
 * article), event slugs are unique sitewide.
 */

export const SLUG_MAX_LENGTH = 120;

/**
 * Derives a URL-safe slug from a title or name. Returns an empty string when
 * there is nothing sluggable in it (e.g. it is entirely punctuation or
 * non-Latin script) — callers must fall back rather than store an empty slug.
 */
export function slugify(title: string): string {
  return (
    title
      .normalize('NFKD')
      // Strip combining marks so "Café" slugs as "cafe" instead of "caf".
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, SLUG_MAX_LENGTH)
      // The slice can leave a trailing hyphen behind when it lands mid-word.
      .replace(/-+$/, '')
  );
}

export function isValidSlug(slug: string): boolean {
  return (
    slug.length > 0 &&
    slug.length <= SLUG_MAX_LENGTH &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  );
}

/**
 * Static route segments that sit alongside an event's `/wiki/[slug]`. An
 * article slug matching one of these would be shadowed by the static route
 * and never resolve, so it's rejected rather than left to 404. `terms` is
 * the Event Terms pseudo-article synthesized onto the wiki list.
 */
export const RESERVED_ARTICLE_SLUGS = ['terms'] as const;

export function isValidArticleSlug(slug: string): boolean {
  return !(RESERVED_ARTICLE_SLUGS as readonly string[]).includes(slug);
}

/**
 * Returns `base` if it is free, otherwise the first `base-2`, `base-3`, …
 * that isn't taken. Suffixes are trimmed back into the length budget so the
 * result always stays a valid slug.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;

  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const trimmed = base
      .slice(0, SLUG_MAX_LENGTH - suffix.length)
      .replace(/-+$/, '');
    const candidate = `${trimmed}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
