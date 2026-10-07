import 'server-only';

import { getBackgroundAuthHeaders } from '@/lib/rsvp/send-rsvp-magic-link';
import { auth } from '@/utils/auth';

import { judgeInviteMailContext } from './judge-invite-mail';

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
export async function sendJudgeInvite(options: {
  email: string;
  eventName: string;
}): Promise<void> {
  await judgeInviteMailContext.run({ eventName: options.eventName }, () =>
    auth.api.signInMagicLink({
      body: {
        email: options.email,
        callbackURL: JUDGE_SIGNUP_PATH,
        errorCallbackURL: JUDGE_SIGNUP_PATH,
      },
      headers: getBackgroundAuthHeaders(),
    }),
  );
}
