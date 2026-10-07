/**
 * Who may open an event's admin dashboard (`/dashboard/admin/events/...`).
 *
 * This is not a permission bundle. Every page, tile and cell under the event
 * dashboard still gates itself on its own single permission (see AGENTS.md).
 * This list only answers whether any of them is visible to the viewer. If none
 * is, the whole section (the events list, the event header, the dashboard home
 * tile) hides, so nobody lands on an empty shell. If one is, the section shows
 * and the viewer sees only the parts they can use.
 *
 * Keep it in sync with what the pages actually check: when you add a tool or
 * cell under the event dashboard, add the permission that gates it here.
 * Otherwise anyone holding only that permission can't reach the feature.
 */

import { anyPermissionMatches } from './permissions';

export const EVENT_DASHBOARD_PERMISSIONS = [
  // applications/ — the applicant roster and their answers
  'application:read:all',
  // review/ — the blind swipe review
  'application:vote:all',
  // overview cells — cohort statistics and the applications-over-time chart
  'application:stats:all',
  // checkin/
  'checkin:write:all',
  // teams/
  'team:read:all',
  // rsvp/
  'rsvp:read:all',
  // overview wiki cell and articles/[articleId]
  'article:read:all',
  // settings/**, subevents/, the event copy cell
  'event:manage:all',
] as const;

export function canOpenEventDashboard(granted: Iterable<string>): boolean {
  const held = [...granted];
  return EVENT_DASHBOARD_PERMISSIONS.some((required) =>
    anyPermissionMatches(held, required),
  );
}
