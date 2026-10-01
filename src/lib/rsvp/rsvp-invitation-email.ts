import React from 'react';
import { render } from 'react-email';
import { RsvpInvitationEmail } from '@/emails/RsvpInvitationEmail';
import type { SendMailOptions } from '@/utils/mail';
import { formatRsvpDeadline } from '@/lib/rsvp/rsvp-datetime';

/**
 * Builds RSVP invitation email copy. Auth tokens and delivery stay outside.
 * Deadline is formatted in Calgary time with a timezone abbreviation.
 */
export async function buildRsvpInvitationEmail(options: {
  eventName: string;
  respondBy: Date;
  magicLinkUrl: string;
  baseUrl: string;
}): Promise<Pick<SendMailOptions, 'subject' | 'text' | 'html'>> {
  const { eventName, respondBy, magicLinkUrl, baseUrl } = options;
  const deadline = formatRsvpDeadline(respondBy);

  return {
    subject: `[Action Required] You're invited to ${eventName}!`,
    text:
      `You're invited to ${eventName}!\n\n` +
      `We'd love to have you there. Let us know if you can make it so we can hold your spot.\n\n` +
      `Please respond by ${deadline}.\n\n` +
      `RSVP now :\n${magicLinkUrl}\n\n` +
      `— The MRUHacks Team\n`,
    html: await render(
      React.createElement(RsvpInvitationEmail, {
        eventName,
        deadline,
        url: magicLinkUrl,
        baseUrl,
      }),
    ),
  };
}
