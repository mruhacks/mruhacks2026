import React from 'react';
import { render } from 'react-email';

import { JudgeInvitationEmail } from '@/emails/JudgeInvitationEmail';
import type { SendMailOptions } from '@/utils/mail';

export async function buildJudgeInviteEmail(options: {
  eventName: string;
  magicLinkUrl: string;
  baseUrl: string;
  /** How long the link lasts, e.g. "24 hours". */
  expiresIn: string;
}): Promise<Pick<SendMailOptions, 'subject' | 'text' | 'html'>> {
  const { eventName, magicLinkUrl, baseUrl, expiresIn } = options;
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
        expiresIn,
      }),
    ),
  };
}
