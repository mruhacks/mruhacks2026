import 'server-only';

import * as Auth from '@/lib/auth/server';
import { sendMail } from '@/utils/mail';

import { buildJudgeInviteEmail } from './judge-invite-mail';
import { JUDGE_SIGNIN_LINK_EXPIRES_IN_SECONDS } from './signin-qr';

/**
 * Where the judge's magic link lands. The dashboard sends anyone not yet
 * onboarded through the judge welcome path first, and lists the event they
 * judge once they're through.
 */
const JUDGE_SIGNUP_PATH = '/dashboard';

/**
 * Emails a "You're judging <event>" magic link. For an address with no
 * account yet, following the link creates one. Judges get no role: the
 * roster row is what authorizes them.
 */
export async function sendJudgeInvite(options: { email: string; eventName: string }): Promise<void> {
  const { url, expiresAt } = await Auth.createMagicLink({ email: options.email, callbackURL: JUDGE_SIGNUP_PATH });
  await sendMail({
    to: options.email,
    ...(await buildJudgeInviteEmail({
      eventName: options.eventName,
      magicLinkUrl: url,
      baseUrl: Auth.getBaseUrl(),
      expiresIn: Auth.formatLinkLifetime(expiresAt),
    })),
  });
}

/**
 * The same magic link `sendJudgeInvite` emails, but short-lived and returned
 * instead of sent, for an organizer to show the judge as a QR code. Like any
 * magic link, it works once.
 */
export async function createJudgeSignInLink(email: string): Promise<string> {
  const { url } = await Auth.createMagicLink({
    email,
    callbackURL: JUDGE_SIGNUP_PATH,
    expiresAt: new Date(Date.now() + JUDGE_SIGNIN_LINK_EXPIRES_IN_SECONDS * 1000),
  });
  return url;
}
