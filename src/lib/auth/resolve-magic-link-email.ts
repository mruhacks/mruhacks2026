import React from 'react';
import { render } from 'react-email';
import { MagicLinkEmail } from '@/emails/MagicLinkEmail';
import { getRsvpMagicLinkMailContext } from '@/lib/rsvp/rsvp-magic-link-context';
import { buildRsvpInvitationEmail } from '@/lib/rsvp/rsvp-invitation-email';
import type { SendMailOptions } from '@/utils/mail';

async function buildGenericSignInMail(
  email: string,
  magicLinkUrl: string,
  baseUrl: string,
): Promise<SendMailOptions> {
  return {
    to: email,
    subject: 'Sign in to MRUHacks',
    text: `Sign in by opening this link:\n\n${magicLinkUrl}\n`,
    html: await render(
      React.createElement(MagicLinkEmail, { url: magicLinkUrl, baseUrl }),
    ),
  };
}

/**
 * Chooses magic-link email copy.
 *
 * RSVP invitation copy is used only when a trusted sender set request-scoped
 * context. `callbackURL` / `source=rsvp` are caller-controlled on the public
 * sign-in endpoint and must not change mail routing or throw.
 */
export async function resolveMagicLinkMailOptions(options: {
  email: string;
  magicLinkUrl: string;
  baseUrl: string;
}): Promise<SendMailOptions> {
  const { email, magicLinkUrl, baseUrl } = options;
  const rsvp = getRsvpMagicLinkMailContext();

  if (rsvp) {
    return {
      to: email,
      ...buildRsvpInvitationEmail({
        eventName: rsvp.eventName,
        respondBy: rsvp.respondBy,
        magicLinkUrl,
      }),
    };
  }

  return buildGenericSignInMail(email, magicLinkUrl, baseUrl);
}
