/**
 * An event's optional custom slug: the nicer-looking segment a participant
 * URL may carry in place of the event's uuid — `/dashboard/events/hacks-2026`
 * instead of `/dashboard/events/3f0c…`. Events without one are still only
 * addressable by uuid.
 *
 * The slug format itself is the shared one (`@/lib/slug`), since it shows up
 * in a URL segment exactly like a wiki article's does. Two extra constraints
 * come from *where* that segment sits: it shares `[eventId]` with real uuids,
 * and it shares its level with the sibling routes under /dashboard/events.
 *
 * Kept free of `server-only` imports — both the settings form and the create
 * dialog validate against this in the browser before submitting.
 */

import { isValidSlug } from './slug';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Static route segments that sit alongside `[eventId]` under
 * /dashboard/events. A slug matching one of these would be shadowed by the
 * static route and never resolve, so it's rejected rather than left to 404.
 */
export const RESERVED_EVENT_SLUGS = ['team'] as const;

/**
 * Whether a `[eventId]` route segment is an event's uuid rather than a slug.
 * A lowercase uuid is also a *format*-valid slug, which is why slugs that
 * look like one are rejected: the route could no longer tell them apart.
 */
export function isEventUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isValidEventSlug(slug: string): boolean {
  return (
    isValidSlug(slug) &&
    !isEventUuid(slug) &&
    !(RESERVED_EVENT_SLUGS as readonly string[]).includes(slug)
  );
}

/**
 * The participant-facing path for an event, preferring its custom slug. Use
 * this wherever a link is *built* from an event row (the homepage register
 * button, the dashboard event tiles, the admin share button) so a configured
 * slug is what actually gets shared.
 */
export function eventPath(event: { id: string; slug?: string | null }): string {
  return `/dashboard/events/${event.slug ?? event.id}`;
}

/**
 * The same thing for the organizer dashboard. Its `[eventId]` segment accepts
 * a slug too, so an admin who arrived from the events list stays on readable
 * URLs all the way down to check-in. Links *within* the event dashboard are
 * built from the current URL's segment instead (`useEventBasePath`), which
 * keeps whichever form the admin arrived with.
 */
export function adminEventPath(event: {
  id: string;
  slug?: string | null;
}): string {
  return `/dashboard/admin/events/${event.slug ?? event.id}`;
}
