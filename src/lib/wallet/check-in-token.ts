import 'server-only';

import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

/** Fallback expiration for a wallet pass when its event has no end date — a
 *  wallet-metadata concern (`pass.setExpirationDate`), unrelated to the
 *  check-in token below. */
export const DEFAULT_QR_TTL_MS = 24 * 60 * 60 * 1000;

/** Ed25519 signatures are always this size, regardless of message length. */
const SIGNATURE_LENGTH = 64;

/**
 * Bump this whenever the wire format changes, and add a case for it in
 * `verifyCheckInToken` rather than replacing the existing parsing — tokens
 * signed under an old version keep circulating (on already-issued passes)
 * until they expire, so a verifier must keep understanding every version it
 * might still see (backward compatible), and an unrecognized future version
 * must be rejected cleanly instead of misparsed as this one (forward
 * compatible). Never change what an existing version number means.
 */
const TOKEN_VERSION = 2;

const VERSION_OFFSET = 0;
const EVENT_ID_OFFSET = 1;
const USER_ID_OFFSET = 17;
/** version + eventId + userId — the whole signed body; v2 has no variable-length part. */
const BODY_LENGTH = 33;
/** v2 tokens are fixed-length: body + signature, nothing variable. */
const TOKEN_LENGTH = BODY_LENGTH + SIGNATURE_LENGTH;

/**
 * v1's wire format additionally carried a big-endian uint32 expiry (unix
 * seconds) at this offset, followed by the participant's name (a 1-byte
 * length prefix then UTF-8 bytes). Neither has ever been read back out of a
 * verified token in production — `scanCheckIn` looks the name up from the DB
 * and checks expiry against the event's own end date, both by `userId` /
 * `eventId` alone — and embedding them bloated the QR code enough to make it
 * hard to scan, so v2 drops both. Kept here only so already-issued v1 passes
 * keep verifying until they expire; v2 does not use these offsets.
 */
const V1_NAME_LENGTH_OFFSET = 37;
const V1_NAME_OFFSET = 38;
const V1_VERSION = 1;

export type CheckInClaims = {
  eventId: string;
  userId: string;
};

function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32 || /[^0-9a-f]/i.test(hex)) {
    throw new Error(`Invalid UUID: ${uuid}`);
  }
  return Buffer.from(hex, 'hex');
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
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
function getPrivateKey(): KeyObject {
  const raw = process.env.CHECK_IN_SIGNING_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error(
      'CHECK_IN_SIGNING_PRIVATE_KEY is required to sign check-in QR codes; see .env.example',
    );
  }
  return createPrivateKey({ key: decodeKeyEnvVar(raw), format: 'pem' });
}

/**
 * The Ed25519 public key counterpart to the signing key — safe to hand to
 * anything that only needs to *verify* tokens (an offline check-in scanner
 * with no server access), since it can't be used to forge new ones.
 *
 * Prefers CHECK_IN_SIGNING_PUBLIC_KEY if it's set, so a verify-only
 * deployment (the offline scanner itself, or any environment that should
 * never hold the private key) can configure just the public key and this
 * still works with no private key present at all. Our own server doesn't
 * need to set it — it falls back to deriving the public key from the
 * private key it already has.
 */
export function getCheckInPublicKey(): KeyObject {
  const explicit = process.env.CHECK_IN_SIGNING_PUBLIC_KEY?.trim();
  return explicit
    ? createPublicKey({ key: decodeKeyEnvVar(explicit), format: 'pem' })
    : createPublicKey(getPrivateKey());
}

/**
 * Builds the signed check-in token as raw bytes:
 *   [0..1)    version  (uint8, currently always TOKEN_VERSION)
 *   [1..17)   eventId  (raw UUID bytes, not hex/dash text)
 *   [17..33)  userId   (raw UUID bytes)
 *   [...end)  Ed25519 signature over everything before it, version byte
 *             included (64 bytes)
 *
 * Signed with Ed25519 instead of an HMAC so a scanner can verify a token's
 * authenticity using only the public key, with no network call back to us
 * and no shared secret it could leak. Deliberately carries nothing but the
 * two ids: no participant name (the scanner looks that up from the DB by
 * `userId`) and no expiry (the scanner checks the event's own end date by
 * `eventId` instead) — v1 embedded both and it bloated the QR code enough to
 * make it hard to scan, for data the scanner already had a source of truth
 * for.
 */
export function buildCheckInToken(eventId: string, userId: string): Buffer {
  const body = Buffer.concat([
    Buffer.from([TOKEN_VERSION]),
    uuidToBytes(eventId),
    uuidToBytes(userId),
  ]);
  const signature = sign(null, body, getPrivateKey());
  return Buffer.concat([body, signature]);
}

/**
 * String form of {@link buildCheckInToken}, for the Apple/Google Wallet
 * barcode fields — both require a JSON string, so this is the same raw
 * bytes base64url-encoded rather than a human-readable/text payload.
 */
export function buildCheckInPayload(eventId: string, userId: string): string {
  return buildCheckInToken(eventId, userId).toString('base64url');
}

/**
 * Decodes and signature-verifies a token from {@link buildCheckInToken}.
 * Returns null for anything malformed or tampered with. Only needs the
 * public key, so this same function works whether it's running on our
 * server or embedded in an offline scanner that only ships the public key.
 *
 * Understands both the current v2 layout and v1's (which additionally
 * carried an expiry and a name after it) — see the comment on
 * `V1_NAME_LENGTH_OFFSET` — so already-issued v1 passes keep verifying until
 * they expire. Either way, only `eventId`/`userId` come back: nothing reads
 * v1's expiry or name back out.
 */
export function verifyCheckInToken(token: Buffer): CheckInClaims | null {
  if (token.length < 1) return null;

  const version = token.readUInt8(VERSION_OFFSET);

  let bodyEnd: number;
  if (version === TOKEN_VERSION) {
    if (token.length !== TOKEN_LENGTH) return null;
    bodyEnd = BODY_LENGTH;
  } else if (version === V1_VERSION) {
    if (token.length < V1_NAME_OFFSET + SIGNATURE_LENGTH) return null;
    const nameLength = token.readUInt8(V1_NAME_LENGTH_OFFSET);
    bodyEnd = V1_NAME_OFFSET + nameLength;
    if (token.length !== bodyEnd + SIGNATURE_LENGTH) return null;
  } else {
    // Reject anything we don't recognize rather than guessing at its layout —
    // when a new version exists, add a branch here for it instead of
    // replacing an existing one.
    return null;
  }

  const body = token.subarray(0, bodyEnd);
  const signature = token.subarray(bodyEnd);

  let publicKey: KeyObject;
  try {
    publicKey = getCheckInPublicKey();
  } catch {
    return null;
  }

  let signatureValid: boolean;
  try {
    signatureValid = verify(null, body, publicKey, signature);
  } catch {
    return null;
  }
  if (!signatureValid) return null;

  try {
    return {
      eventId: bytesToUuid(body.subarray(EVENT_ID_OFFSET, USER_ID_OFFSET)),
      userId: bytesToUuid(body.subarray(USER_ID_OFFSET, BODY_LENGTH)),
    };
  } catch {
    return null;
  }
}

/** String form of {@link verifyCheckInToken}, for a base64url payload from {@link buildCheckInPayload}. */
export function verifyCheckInPayload(payload: string): CheckInClaims | null {
  let token: Buffer;
  try {
    token = Buffer.from(payload, 'base64url');
  } catch {
    return null;
  }
  return verifyCheckInToken(token);
}
