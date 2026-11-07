import 'server-only';

import React from 'react';
import { render } from 'react-email';

import { MagicLinkEmail } from '@/emails/MagicLinkEmail';
import { sendMail } from '@/utils/mail';

import { createMagicLink, getBaseUrl } from './magic-link';

/**
 * Time left until `expiresAt` as email copy ("24 hours", "3 days"). Rounds
 * down, so the email never promises more time than the link actually has.
 */
export function formatLinkLifetime(expiresAt: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, (expiresAt.getTime() - now.getTime()) / 1000);
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (seconds < 3600) {
    return plural(Math.max(1, Math.floor(seconds / 60)), 'minute');
  }
  if (seconds < 2 * 86400) return plural(Math.floor(seconds / 3600), 'hour');
  return plural(Math.floor(seconds / 86400), 'day');
}

/** Emails a plain "Sign in to MRUHacks" magic link. */
export async function sendSignInLink(options: { email: string; callbackURL: string }): Promise<void> {
  const { url, expiresAt } = await createMagicLink(options);
  await sendMail({
    to: options.email,
    subject: 'Sign in to MRUHacks',
    text: `Sign in by opening this link:\n\n${url}\n`,
    html: await render(
      React.createElement(MagicLinkEmail, {
        url,
        baseUrl: getBaseUrl(),
        expiresIn: formatLinkLifetime(expiresAt),
      }),
    ),
  });
}
