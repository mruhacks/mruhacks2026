import 'server-only';

import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

/** Default validity window for a check-in code when an event has no end date. */
export const DEFAULT_QR_TTL_MS = 24 * 60 * 60 * 1000;

/** Ed25519 signatures are always this size, regardless of message length. */
const SIGNATURE_LENGTH = 64;
/** More than enough for any real name; keeps the length prefix to one byte. */
const MAX_NAME_BYTES = 255;

/**
 * Bump this whenever the wire format changes, and add a case for it in
 * `verifyCheckInToken` rather than replacing the existing parsing — tokens
 * signed under an old version keep circulating (on already-issued passes)
 * until they expire, so a verifier must keep understanding every version it
 * might still see (backward compatible), and an unrecognized future version
 * must be rejected cleanly instead of misparsed as this one (forward
 * compatible). Never change what an existing version number means.
 */
const TOKEN_VERSION = 1;

const VERSION_OFFSET = 0;
const EVENT_ID_OFFSET = 1;
const USER_ID_OFFSET = 17;
const EXPIRES_AT_OFFSET = 33;
const NAME_LENGTH_OFFSET = 37;
const NAME_OFFSET = 38;
/** version + eventId + userId + expiresAt + the 1-byte name-length prefix. */
const FIXED_PREFIX_LENGTH = NAME_OFFSET;

export type CheckInClaims = {
  eventId: string;
  userId: string;
  name: string;
  expiresAt: Date;
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

function uint32BE(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value);
  return buf;
}

/**
 * Truncates to at most `maxBytes` UTF-8 bytes without splitting a Unicode
 * code point (which would corrupt the last character into invalid UTF-8).
 * `userProfiles.full_name` is `varchar(255)` — 255 *characters*, per
 * Postgres — not 255 bytes, so a name using multi-byte characters (CJK,
 * emoji, accented Latin, ...) can need up to 4x that in UTF-8 and still be
 * entirely DB-valid. `for...of` iterates by code point, so this never
 * splits one even though it can still split a multi-code-point grapheme
 * (e.g. an emoji built from several code points) — an acceptable cosmetic
 * edge case for a fallback truncation.
 */
function truncateToUtf8Bytes(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  let result = '';
  let bytes = 0;
  for (const char of value) {
    bytes += Buffer.byteLength(char, 'utf8');
    if (bytes > maxBytes) break;
    result += char;
  }
  return result;
}

function encodeName(name: string): Buffer {
  const nameBytes = Buffer.from(
    truncateToUtf8Bytes(name, MAX_NAME_BYTES),
    'utf8',
  );
  return Buffer.concat([Buffer.from([nameBytes.length]), nameBytes]);
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
 *   [33..37)  expiresAt (uint32, unix seconds, big-endian)
 *   [37..38)  name length (uint8)
 *   [38..38+n) participant name (UTF-8)
 *   [...end)  Ed25519 signature over everything before it, version byte
 *             included (64 bytes)
 *
 * Signed with Ed25519 instead of an HMAC so a scanner can verify a token's
 * authenticity — and read the embedded name — using only the public key,
 * with no network call back to us and no shared secret it could leak.
 */
export function buildCheckInToken(
  eventId: string,
  userId: string,
  name: string,
  expiresAt: Date,
): Buffer {
  const body = Buffer.concat([
    Buffer.from([TOKEN_VERSION]),
    uuidToBytes(eventId),
    uuidToBytes(userId),
    uint32BE(Math.floor(expiresAt.getTime() / 1000)),
    encodeName(name),
  ]);
  const signature = sign(null, body, getPrivateKey());
  return Buffer.concat([body, signature]);
}

/**
 * String form of {@link buildCheckInToken}, for the Apple/Google Wallet
 * barcode fields — both require a JSON string, so this is the same raw
 * bytes base64url-encoded rather than a human-readable/text payload.
 */
export function buildCheckInPayload(
  eventId: string,
  userId: string,
  name: string,
  expiresAt: Date,
): string {
  return buildCheckInToken(eventId, userId, name, expiresAt).toString(
    'base64url',
  );
}

/**
 * Decodes and signature-verifies a token from {@link buildCheckInToken}.
 * Returns null for anything malformed or tampered with. Only needs the
 * public key, so this same function works whether it's running on our
 * server or embedded in an offline scanner that only ships the public key.
 *
 * Deliberately does *not* check `expiresAt` against the current time — that
 * a token successfully decodes is independent of whether it's still valid;
 * callers decide that for themselves. `build` followed by `verify` is a
 * no-op on valid input (down to whole-second `expiresAt` precision).
 */
export function verifyCheckInToken(token: Buffer): CheckInClaims | null {
  if (token.length < FIXED_PREFIX_LENGTH + SIGNATURE_LENGTH) return null;

  // Reject anything we don't recognize rather than guessing at its layout —
  // when a second version exists, add a branch here for it instead of
  // replacing this check.
  if (token.readUInt8(VERSION_OFFSET) !== TOKEN_VERSION) return null;

  const nameLength = token.readUInt8(NAME_LENGTH_OFFSET);
  const nameEnd = NAME_OFFSET + nameLength;
  if (token.length !== nameEnd + SIGNATURE_LENGTH) return null;

  const body = token.subarray(0, nameEnd);
  const signature = token.subarray(nameEnd);

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
      userId: bytesToUuid(body.subarray(USER_ID_OFFSET, EXPIRES_AT_OFFSET)),
      expiresAt: new Date(body.readUInt32BE(EXPIRES_AT_OFFSET) * 1000),
      name: body.subarray(NAME_OFFSET, nameEnd).toString('utf8'),
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
