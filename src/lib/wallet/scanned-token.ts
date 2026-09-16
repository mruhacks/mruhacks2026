import type { CheckInClaims } from './check-in-token';
import { verifyCheckInPayload, verifyCheckInToken } from './check-in-token';

/**
 * Wallet passes encode the token as base64url text; the in-app QR encodes the
 * raw bytes. Both arrive base64url-encoded, so try the raw form first and then
 * the text form. Either way the Ed25519 check rejects a wrong guess.
 *
 * Lives here rather than beside the check-in action because a `'use server'`
 * module can only export server actions — and the scanner's other half
 * (`payloadFromResult`) has to be tested against this one to be worth
 * anything.
 */
export function readScannedToken(payload: string): CheckInClaims | null {
  const bytes = Buffer.from(payload, 'base64url');
  if (bytes.length === 0) return null;

  return (
    verifyCheckInToken(bytes) ??
    verifyCheckInPayload(bytes.toString('latin1').trim())
  );
}
