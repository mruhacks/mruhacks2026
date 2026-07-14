import { resolveRsvpMagicLinkMailOptions } from '@/lib/rsvp/resolve-rsvp-magic-link-email';
import type { SendMailOptions } from '@/utils/mail';

function buildGenericSignInMail(
  email: string,
  magicLinkUrl: string,
): SendMailOptions {
  return {
    to: email,
    subject: 'Sign in to MRUHacks',
    text: `Sign in by opening this link:\n\n${magicLinkUrl}\n`,
    html: `<p>Sign in by clicking <a href="${magicLinkUrl}">this link</a>.</p>`,
  };
}

/**
 * Reads `callbackURL` from a Better Auth magic-link verify URL.
 * Returns null when the magic-link URL or callback is unusable.
 */
export function getMagicLinkCallbackURL(
  magicLinkUrl: string,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(magicLinkUrl);
  } catch {
    return null;
  }

  const rawCallback = parsed.searchParams.get('callbackURL');
  if (!rawCallback) return null;

  // Relative internal paths only — reject absolute / protocol-relative URLs.
  if (!rawCallback.startsWith('/') || rawCallback.startsWith('//')) {
    return null;
  }

  return rawCallback;
}

/**
 * Central magic-link email router.
 *
 * Parses the Better Auth verify URL, reads `callbackURL` / `source`, and
 * routes RSVP invitations to the RSVP resolver. Everything else gets the
 * generic sign-in email.
 */
export async function resolveMagicLinkMailOptions(options: {
  email: string;
  magicLinkUrl: string;
}): Promise<SendMailOptions> {
  const { email, magicLinkUrl } = options;
  const callbackURL = getMagicLinkCallbackURL(magicLinkUrl);

  if (!callbackURL) {
    return buildGenericSignInMail(email, magicLinkUrl);
  }

  const [, queryPart] = callbackURL.split('?', 2);
  const source = new URLSearchParams(queryPart ?? '').get('source');

  if (source === 'rsvp') {
    return resolveRsvpMagicLinkMailOptions({
      email,
      magicLinkUrl,
      callbackURL,
    });
  }

  return buildGenericSignInMail(email, magicLinkUrl);
}
