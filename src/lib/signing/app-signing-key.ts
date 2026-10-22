import 'server-only';

import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';

/**
 * The app's one Ed25519 signing key: it signs check-in QR codes and the
 * links in campaign emails (unsubscribe, wallet). It used to be named for
 * check-in only, so the old `CHECK_IN_SIGNING_*` names are still read as a
 * fallback until every environment has the `APP_SIGNING_*` ones set.
 */
export const APP_SIGNING_PRIVATE_KEY_ENV = [
  'APP_SIGNING_PRIVATE_KEY',
  'CHECK_IN_SIGNING_PRIVATE_KEY',
] as const;
const APP_SIGNING_PUBLIC_KEY_ENV = [
  'APP_SIGNING_PUBLIC_KEY',
  'CHECK_IN_SIGNING_PUBLIC_KEY',
] as const;

/** First non-empty value among `names`, in order. */
export function readEnvWithFallback(
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

/** Same PEM-or-base64-of-PEM handling `generate-pass.ts` uses for the Apple certs. */
function decodeKeyEnvVar(raw: string): Buffer {
  return raw.startsWith('-----BEGIN')
    ? Buffer.from(raw, 'utf8')
    : Buffer.from(raw, 'base64');
}

// Not cached: reading process.env fresh on every call is cheap relative to
// the sign/verify operation itself, and it means a runtime key rotation (or
// swapping env vars, as tests do) takes effect immediately.
export function getAppSigningPrivateKey(): KeyObject {
  const raw = readEnvWithFallback(APP_SIGNING_PRIVATE_KEY_ENV);
  if (!raw) {
    throw new Error(
      'APP_SIGNING_PRIVATE_KEY (or the legacy CHECK_IN_SIGNING_PRIVATE_KEY) is required to sign tokens; see .env.example',
    );
  }
  return createPrivateKey({ key: decodeKeyEnvVar(raw), format: 'pem' });
}

/**
 * The Ed25519 public key counterpart to the signing key — safe to hand to
 * anything that only needs to *verify* tokens (an offline check-in scanner
 * with no server access), since it can't be used to forge new ones.
 *
 * Prefers an explicit public key if one is set, so a verify-only deployment
 * (the offline scanner itself, or any environment that should never hold the
 * private key) can configure just the public key and this still works with
 * no private key present at all. Our own server doesn't need to set it — it
 * falls back to deriving the public key from the private key it already has.
 */
export function getAppSigningPublicKey(): KeyObject {
  const explicit = readEnvWithFallback(APP_SIGNING_PUBLIC_KEY_ENV);
  return explicit
    ? createPublicKey({ key: decodeKeyEnvVar(explicit), format: 'pem' })
    : createPublicKey(getAppSigningPrivateKey());
}

/** Canonical text form of a public key, as stored in `signing_public_keys`. */
export function publicKeyToPem(key: KeyObject): string {
  return key.export({ type: 'spki', format: 'pem' }).toString().trim();
}
