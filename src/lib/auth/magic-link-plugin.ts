import 'server-only';

import { and, eq } from 'drizzle-orm';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint, formCsrfMiddleware, originCheck } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import * as z from 'zod';

import * as schema from '@/db/schema';
import { db } from '@/utils/db';

import { MAGIC_LINK_ERROR_CALLBACK_URL } from './email-link-confirm-url';
import { consumeMagicLink } from './magic-link';
import { claimMagicLinkCooldown, releaseMagicLinkCooldown } from './magic-link-cooldown';
import { sendSignInLink } from './sign-in-link';

/**
 * Flips an unverified account to verified, first stripping every login and
 * session it picked up before anyone proved they own the address — otherwise
 * whoever registered someone else's email with a password keeps access once
 * the real owner signs in by link. The conditional update locks the user row,
 * so a second concurrent click waits, finds it already verified and leaves
 * the first click's new session alone.
 */
async function claimUnverifiedAccount(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(schema.user)
      .set({ emailVerified: true })
      .where(and(eq(schema.user.id, userId), eq(schema.user.emailVerified, false)))
      .returning({ id: schema.user.id });
    if (!claimed) return;
    await tx.delete(schema.account).where(eq(schema.account.userId, userId));
    await tx.delete(schema.session).where(eq(schema.session.userId, userId));
  });
}

/**
 * Our magic-link sign-in, replacing Better Auth's plugin. Links are minted by
 * `createMagicLink` and each sender emails its own copy; Better Auth only
 * hosts the two endpoints that need its context:
 *
 * - `POST /sign-in/magic-link`: the public sign-in form. Lives here so the
 *   captcha plugin and rate-limit rules keyed on that path still cover it.
 * - `GET /magic-link/verify`: spends the token and sets the session cookie.
 *   Reached from the confirm page, never straight from an email.
 */
export const magicLink = () =>
  ({
    id: 'magic-link',
    endpoints: {
      signInMagicLink: createAuthEndpoint(
        '/sign-in/magic-link',
        {
          method: 'POST',
          requireHeaders: true,
          use: [formCsrfMiddleware, originCheck((ctx) => ctx.body.callbackURL || '/')],
          body: z.object({
            email: z.email(),
            callbackURL: z.string().optional(),
          }),
        },
        async (ctx) => {
          const email = ctx.body.email.trim().toLowerCase();
          // Absorbs a double submit, a second tab or a retry: one email a minute.
          if (!(await claimMagicLinkCooldown(email))) {
            throw new APIError('TOO_MANY_REQUESTS', {
              message: 'A sign-in link was already sent to this address. Check your inbox, or try again in a minute.',
            });
          }
          try {
            await sendSignInLink({ email, callbackURL: ctx.body.callbackURL || '/' });
          } catch (error) {
            console.error('[auth] sending sign-in link failed', error);
            await releaseMagicLinkCooldown(email);
            throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Could not send the sign-in link. Try again.' });
          }
          return ctx.json({ status: true });
        },
      ),
      magicLinkVerify: createAuthEndpoint(
        '/magic-link/verify',
        {
          method: 'GET',
          requireHeaders: true,
          use: [originCheck((ctx) => ctx.query.callbackURL || '/')],
          query: z.object({
            token: z.string(),
            callbackURL: z.string().optional(),
          }),
        },
        async (ctx) => {
          const fail = (error: string): never => {
            const url = new URL(MAGIC_LINK_ERROR_CALLBACK_URL, ctx.context.baseURL);
            url.searchParams.set('error', error);
            throw ctx.redirect(url.toString());
          };
          const email = await consumeMagicLink(ctx.query.token);
          if (!email) return fail('INVALID_TOKEN');

          const { internalAdapter } = ctx.context;
          let user = (await internalAdapter.findUserByEmail(email))?.user;
          if (!user) {
            user = await internalAdapter.createUser({ email, emailVerified: true, name: '' }, { method: 'magic-link' });
          } else if (!user.emailVerified) {
            await claimUnverifiedAccount(user.id);
            user = { ...user, emailVerified: true };
          }

          const session = await internalAdapter.createSession(user.id);
          if (!session) return fail('failed_to_create_session');
          await setSessionCookie(ctx, { session, user });

          throw ctx.redirect(new URL(ctx.query.callbackURL || '/', ctx.context.baseURL).toString());
        },
      ),
    },
    rateLimit: [{ pathMatcher: (path) => path.startsWith('/magic-link/verify'), window: 60, max: 5 }],
  }) satisfies BetterAuthPlugin;
