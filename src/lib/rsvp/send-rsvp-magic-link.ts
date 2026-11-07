import 'server-only';

import * as Auth from '@/lib/auth/server';
import { sendMail } from '@/utils/mail';

import { buildRsvpInvitationEmail } from './rsvp-invitation-email';

/**
 * Emails an RSVP invitation carrying a magic link that lasts exactly until
 * the wave's `respondBy`. Does not create waves or response rows — a pending
 * response must already exist.
 */
export async function sendRsvpMagicLink(options: {
  email: string;
  eventId: string;
  eventName: string;
  respondBy: Date;
}): Promise<void> {
  const { url } = await Auth.createMagicLink({
    email: options.email,
    callbackURL: `/dashboard/events/${options.eventId}?source=rsvp`,
    expiresAt: options.respondBy,
  });
  await sendMail({
    to: options.email,
    ...(await buildRsvpInvitationEmail({
      eventName: options.eventName,
      respondBy: options.respondBy,
      magicLinkUrl: url,
      baseUrl: Auth.getBaseUrl(),
    })),
  });
}
