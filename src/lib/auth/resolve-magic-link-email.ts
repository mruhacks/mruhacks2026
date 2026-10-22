import React from 'react';
import { render } from 'react-email';
import { MagicLinkEmail } from '@/emails/MagicLinkEmail';
import { getRsvpMagicLinkMailContext } from '@/lib/rsvp/rsvp-magic-link-context';
import { buildRsvpInvitationEmail } from '@/lib/rsvp/rsvp-invitation-email';
import {
  buildJudgeInviteEmail,
  getJudgeInviteMailContext,
} from '@/lib/judging/judge-invite-mail';
import type { SendMailOptions } from '@/utils/mail';

/**
 * A link's lifetime as email copy ("24 hours", "3 days"). Rounds down, so the
 * email never promises more time than the link actually has.
 */
function formatLinkLifetime(seconds: number): string {
  const plural = (n: number, unit: string) =>
    `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (seconds < 3600) {
    return plural(Math.max(1, Math.floor(seconds / 60)), 'minute');
  }
  if (seconds < 2 * 86400) return plural(Math.floor(seconds / 3600), 'hour');
  return plural(Math.floor(seconds / 86400), 'day');
}

async function buildGenericSignInMail(
  email: string,
  magicLinkUrl: string,
  baseUrl: string,
  expiresIn: string,
): Promise<SendMailOptions> {
  return {
    to: email,
    subject: 'Sign in to MRUHacks',
    text: `Sign in by opening this link:\n\n${magicLinkUrl}\n`,
    html: await render(
      React.createElement(MagicLinkEmail, {
        url: magicLinkUrl,
        baseUrl,
        expiresIn,
      }),
    ),
  };
}

/**
 * Chooses magic-link email copy.
 *
 * RSVP invitation and judge invitation copy are used only when a trusted
 * sender set request-scoped context. `callbackURL` / `source=rsvp` are caller-controlled on the public
 * sign-in endpoint and must not change mail routing or throw.
 */
export async function resolveMagicLinkMailOptions(options: {
  email: string;
  magicLinkUrl: string;
  baseUrl: string;
  /**
   * The token lifetime Better Auth just used, which depends on the sender: an
   * RSVP link lasts until `respondBy` (its email shows that deadline instead),
   * sign-in and judge links use the plugin default.
   */
  expiresInSeconds: number;
}): Promise<SendMailOptions> {
  const { email, magicLinkUrl, baseUrl } = options;
  const expiresIn = formatLinkLifetime(options.expiresInSeconds);
  const rsvp = getRsvpMagicLinkMailContext();

  if (rsvp) {
    return {
      to: email,
      ...(await buildRsvpInvitationEmail({
        eventName: rsvp.eventName,
        respondBy: rsvp.respondBy,
        magicLinkUrl,
        baseUrl,
      })),
    };
  }

  const judge = getJudgeInviteMailContext();
  if (judge) {
    return {
      to: email,
      ...(await buildJudgeInviteEmail({
        eventName: judge.eventName,
        magicLinkUrl,
        baseUrl,
        expiresIn,
      })),
    };
  }

  return buildGenericSignInMail(email, magicLinkUrl, baseUrl, expiresIn);
}
