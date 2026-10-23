import 'server-only';

import * as Rsvp from '@/lib/rsvp/server';
import { auth } from '@/utils/auth';

import { judgeInviteMailContext, judgeSignInLinkCapture } from './judge-invite-mail';

/**
 * Where the judge's magic link lands. The dashboard sends anyone not yet
 * onboarded through the judge welcome path first, and lists the event they
 * judge once they're through.
 */
const JUDGE_SIGNUP_PATH = '/dashboard';

/**
 * Emails a "You're judging <event>" magic link. For an address with no
 * account yet, following the link creates one — the same magic-link sign-up
 * the admin `inviteUser` flow relies on. Judges get no role: the roster row
 * is what authorizes them.
 */
export async function sendJudgeInvite(options: { email: string; eventName: string }): Promise<void> {
  await judgeInviteMailContext.run({ eventName: options.eventName }, () =>
    auth.api.signInMagicLink({
      body: {
        email: options.email,
        callbackURL: JUDGE_SIGNUP_PATH,
      },
      headers: Rsvp.getBackgroundAuthHeaders(),
    }),
  );
}

/**
 * Mints the same magic link `sendJudgeInvite` emails, but returns it instead
 * of sending it, for an organizer to show the judge as a QR code. Lasts
 * `JUDGE_SIGNIN_LINK_EXPIRES_IN_SECONDS` and, like any magic link, works once.
 */
export async function createJudgeSignInLink(email: string): Promise<string> {
  const capture: { url?: string } = {};
  await judgeSignInLinkCapture.run(capture, () =>
    auth.api.signInMagicLink({
      body: { email, callbackURL: JUDGE_SIGNUP_PATH },
      headers: Rsvp.getBackgroundAuthHeaders(),
    }),
  );
  if (!capture.url) throw new Error('No sign-in link was minted');
  return capture.url;
}
