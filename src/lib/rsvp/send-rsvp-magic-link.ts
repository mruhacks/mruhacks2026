import 'server-only';

import { auth } from '@/utils/auth';

/**
 * Headers for Better Auth server API calls outside a browser request
 * (CLI, cron). Uses BETTER_AUTH_URL as Origin instead of Next.js `headers()`.
 */
export function getBackgroundAuthHeaders(): Headers {
  const baseUrl = process.env.BETTER_AUTH_URL?.trim();
  if (!baseUrl) {
    throw new Error(
      'BETTER_AUTH_URL is required to send RSVP magic-link invitations',
    );
  }
  return new Headers({
    origin: baseUrl,
  });
}

/** Callback path used for RSVP invitation magic links. */
export function getRsvpMagicLinkCallbackURL(eventId: string): string {
  return `/dashboard/events/${eventId}?source=rsvp`;
}

/**
 * Sends a Better Auth magic link with the RSVP callback. Does not create
 * waves or response rows — a pending response must already exist.
 */
export async function sendRsvpMagicLink(options: {
  email: string;
  eventId: string;
  /** Optional pre-built headers; otherwise uses background auth headers. */
  headers?: Headers;
}): Promise<void> {
  const callbackURL = getRsvpMagicLinkCallbackURL(options.eventId);
  const headers = options.headers ?? getBackgroundAuthHeaders();

  await auth.api.signInMagicLink({
    body: {
      email: options.email,
      callbackURL,
      errorCallbackURL: callbackURL,
    },
    headers,
  });
}
