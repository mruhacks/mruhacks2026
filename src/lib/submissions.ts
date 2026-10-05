/**
 * Project submission rules, as pure functions shared by server and client:
 * when an event takes submissions, whether the window is open, and what a
 * valid link looks like. Nothing outside this module should re-derive them.
 */

export const SUBMISSION_TITLE_MAX_LENGTH = 100;
export const SUBMISSION_MARKDOWN_MAX_LENGTH = 20_000;
/** Inline images plus the cover, per submission. */
export const SUBMISSION_MAX_IMAGES = 20;
/** Default title for a freshly started draft; editable straight away. */
export const NEW_SUBMISSION_TITLE = 'Untitled project';

/** Editor heartbeat cadence, and how recent a teammate's must be to count. */
export const SUBMISSION_HEARTBEAT_INTERVAL_MS = 30_000;
export const SUBMISSION_PRESENCE_WINDOW_MS = 90_000;

/** Where source code may live. Required before a project can be published. */
export const REPO_HOSTS = [
  'github.com',
  'gitlab.com',
  'codeberg.org',
  'bitbucket.org',
  'huggingface.co',
] as const;

/** Where a demo video may live. */
export const VIDEO_HOSTS = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'loom.com',
] as const;

export type SubmissionLinkKind = 'repo' | 'video' | 'demo';

function parseHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname ? url : null;
  } catch {
    return null;
  }
}

/** `host` itself or any subdomain of it (`www.github.com`, `m.youtube.com`). */
function hostMatches(hostname: string, hosts: readonly string[]): boolean {
  const host = hostname.toLowerCase();
  return hosts.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

/**
 * Why `value` isn't acceptable as a `kind` link, or null when it is. Every
 * link must be `https://`; repo and video links must also be on their host
 * list.
 */
export function submissionLinkError(
  kind: SubmissionLinkKind,
  value: string,
): string | null {
  const url = parseHttpsUrl(value);
  if (!url) return 'Enter a full https:// link.';
  if (kind === 'repo' && !hostMatches(url.hostname, REPO_HOSTS)) {
    return `Repository links must be on ${REPO_HOSTS.join(', ')}.`;
  }
  if (kind === 'video' && !hostMatches(url.hostname, VIDEO_HOSTS)) {
    return `Video links must be on ${VIDEO_HOSTS.join(', ')}.`;
  }
  return null;
}

type SubmissionEventFields = {
  hasApplication: boolean;
  teamsEnabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  submissionsCloseAt: Date | null;
};

/**
 * The event is configured to take submissions at all: an application event
 * with teams, and a deadline strictly inside its start/end.
 */
export function isSubmissionsEnabled(event: SubmissionEventFields): boolean {
  const { startsAt, endsAt, submissionsCloseAt } = event;
  return (
    event.hasApplication &&
    event.teamsEnabled &&
    startsAt != null &&
    endsAt != null &&
    submissionsCloseAt != null &&
    startsAt.getTime() < submissionsCloseAt.getTime() &&
    submissionsCloseAt.getTime() < endsAt.getTime()
  );
}

/**
 * Where an event is in its submission window. `closed` is the freeze: from
 * the deadline on, neither the content nor the published flag can change.
 * Derived on every read, so moving the deadline later reopens editing.
 */
export type SubmissionWindow = 'disabled' | 'not_open' | 'open' | 'closed';

export function getSubmissionWindow(
  event: SubmissionEventFields,
  now: Date = new Date(),
): SubmissionWindow {
  if (!isSubmissionsEnabled(event)) return 'disabled';
  if (now.getTime() < event.startsAt!.getTime()) return 'not_open';
  if (now.getTime() >= event.submissionsCloseAt!.getTime()) return 'closed';
  return 'open';
}

/**
 * Past the submission deadline: the team roster is what gets credited, so
 * self-service team changes stop. Applies whenever a deadline is set, even if
 * the rest of the feature's prerequisites are not.
 */
export function isPastSubmissionDeadline(
  submissionsCloseAt: Date | null,
  now: Date = new Date(),
): boolean {
  return (
    submissionsCloseAt != null && now.getTime() >= submissionsCloseAt.getTime()
  );
}
