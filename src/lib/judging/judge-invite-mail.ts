import { AsyncLocalStorage } from 'node:async_hooks';
import React from 'react';
import { render } from 'react-email';

import { JudgeInvitationEmail } from '@/emails/JudgeInvitationEmail';
import type { SendMailOptions } from '@/utils/mail';

type JudgeInviteMailContext = { eventName: string };

export const judgeInviteMailContext =
  new AsyncLocalStorage<JudgeInviteMailContext>();

/**
 * Request-scoped judge-invite intent, read by the magic-link mail hook. Set
 * only by `sendJudgeInvite` — never inferred from the caller-controlled
 * `callbackURL`, same as the RSVP context.
 */
export function getJudgeInviteMailContext():
  | JudgeInviteMailContext
  | undefined {
  return judgeInviteMailContext.getStore();
}

export async function buildJudgeInviteEmail(options: {
  eventName: string;
  magicLinkUrl: string;
  baseUrl: string;
}): Promise<Pick<SendMailOptions, 'subject' | 'text' | 'html'>> {
  const { eventName, magicLinkUrl, baseUrl } = options;
  return {
    subject: `You're judging ${eventName}`,
    text:
      `You've been added as a judge for ${eventName}.\n\n` +
      `Sign in with this link to set up your account before the expo:\n${magicLinkUrl}\n\n` +
      `— The MRUHacks Team\n`,
    html: await render(
      React.createElement(JudgeInvitationEmail, {
        eventName,
        url: magicLinkUrl,
        baseUrl,
      }),
    ),
  };
}
