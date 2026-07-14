import type { SendMailOptions } from '@/utils/mail';

function formatDeadline(respondBy: Date): string {
  return respondBy.toLocaleString('en-CA', {
    dateStyle: 'full',
    timeStyle: 'short',
  });
}

/**
 * Builds RSVP invitation email copy. Auth tokens and delivery stay outside.
 */
export function buildRsvpInvitationEmail(options: {
  eventName: string;
  respondBy: Date;
  magicLinkUrl: string;
}): Pick<SendMailOptions, 'subject' | 'text' | 'html'> {
  const { eventName, respondBy, magicLinkUrl } = options;
  const deadline = formatDeadline(respondBy);

  return {
    subject: `RSVP invitation — ${eventName}`,
    text:
      `You've been invited to RSVP for ${eventName}.\n\n` +
      `Please respond by ${deadline}.\n\n` +
      `View RSVP (signs you in automatically):\n${magicLinkUrl}\n`,
    html:
      `<p>You've been invited to RSVP for <strong>${eventName}</strong>.</p>` +
      `<p>Please respond by <strong>${deadline}</strong>.</p>` +
      `<p><a href="${magicLinkUrl}">View RSVP</a></p>`,
  };
}
