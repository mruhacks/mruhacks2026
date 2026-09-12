/**
 * Helpers for the name a social sign-in provider gave us.
 *
 * `user.name` is a display name and may be a GitHub handle, so it is not safe
 * to pre-fill into a profile's Full Name. `user.oauthName` is written only when
 * Google or GitHub supplied a real name (see `mapProfileToUser` in
 * src/utils/auth.ts), which makes it the value the profile forms seed from.
 */

/** Human-readable labels for the `account.providerId` values we issue. */
export const SIGN_IN_PROVIDER_LABELS: Record<string, string> = {
  credential: 'Email & password',
  google: 'Google',
  github: 'GitHub',
};

/**
 * Provider-supplied name used to seed a blank profile form, or an empty string
 * when no provider gave us one (email/magic-link sign-ups, or a GitHub account
 * with no public name).
 */
export function oauthPrefillName(oauthName: string | null | undefined): string {
  return oauthName?.trim() ?? '';
}
