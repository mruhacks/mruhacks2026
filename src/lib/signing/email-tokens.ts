import 'server-only';

import { sign, verify, createPublicKey, type KeyObject } from 'node:crypto';
import { sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { db } from '@/utils/db';
import { getAppSigningPrivateKey, getAppSigningPublicKey, publicKeyToPem } from './app-signing-key';

/**
 * Signed tokens carried by links in campaign emails:
 *
 *   base64url( version (1 byte) | data | Ed25519 signature (64 bytes) )
 *
 * The signature covers a per-kind label as well as `version | data`, so a
 * token minted for one kind (a wallet link) can never verify as another (an
 * unsubscribe), even if their data happened to line up byte for byte. The
 * label isn't part of the token itself.
 *
 * These links never expire, so they have to outlive key rotation: every sign
 * records the current public key in `signing_public_keys`, and verification
 * falls back to every stored key that isn't revoked.
 *
 * Like the check-in token, each kind's version byte is only ever added to,
 * never redefined: an unknown version is rejected cleanly rather than parsed
 * as the current one.
 */

const SIGNATURE_LENGTH = 64;
const UUID_LENGTH = 16;

type TokenKind = 'unsubscribe' | 'wallet';

const KIND_LABELS: Record<TokenKind, Buffer> = {
  unsubscribe: Buffer.from('mruhacks:unsubscribe\0'),
  wallet: Buffer.from('mruhacks:wallet\0'),
};

const UNSUBSCRIBE_V1 = 1;
const WALLET_V1 = 1;

function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32 || /[^0-9a-f]/i.test(hex)) {
    throw new Error(`Invalid UUID: ${uuid}`);
  }
  return Buffer.from(hex, 'hex');
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

// ── Stored public keys ─────────────────────────────────────────────────────

/**
 * One upsert per process per key, not one per email: a campaign signs a
 * token for every recipient, and the row only needs to exist. Keyed by the
 * PEM so a key swapped at runtime (rotation, or tests) is recorded too.
 */
const recordedKeys = new Map<string, Promise<void>>();

function recordCurrentPublicKey(): Promise<void> {
  const pem = publicKeyToPem(getAppSigningPublicKey());
  let pending = recordedKeys.get(pem);
  if (!pending) {
    pending = db
      .insert(schema.signingPublicKeys)
      .values({ publicKey: pem })
      .onConflictDoUpdate({
        target: schema.signingPublicKeys.publicKey,
        set: { lastUsedAt: sql`now()` },
      })
      .then(() => undefined);
    // A failed write is retried on the next sign instead of being memoized.
    pending.catch(() => recordedKeys.delete(pem));
    recordedKeys.set(pem, pending);
  }
  return pending;
}

/**
 * Keys a token may verify against: the current one first (unless it's been
 * revoked), then every other stored key that isn't revoked.
 */
async function verificationKeys(): Promise<KeyObject[]> {
  const rows = await db
    .select({
      publicKey: schema.signingPublicKeys.publicKey,
      revokedAt: schema.signingPublicKeys.revokedAt,
    })
    .from(schema.signingPublicKeys);
  const revoked = new Set(rows.filter((row) => row.revokedAt).map((row) => row.publicKey));

  const keys: KeyObject[] = [];
  let currentPem: string | null = null;
  try {
    const current = getAppSigningPublicKey();
    currentPem = publicKeyToPem(current);
    if (!revoked.has(currentPem)) keys.push(current);
  } catch {
    // No key configured here; stored keys may still verify.
  }
  for (const row of rows) {
    if (row.revokedAt || row.publicKey === currentPem) continue;
    try {
      keys.push(createPublicKey(row.publicKey));
    } catch {
      console.warn('[signing] skipping an unparseable stored public key');
    }
  }
  return keys;
}

// ── Generic sign / open ────────────────────────────────────────────────────

async function signToken(kind: TokenKind, version: number, data: Buffer): Promise<string> {
  await recordCurrentPublicKey();
  const body = Buffer.concat([Buffer.from([version]), data]);
  const signature = sign(null, Buffer.concat([KIND_LABELS[kind], body]), getAppSigningPrivateKey());
  return Buffer.concat([body, signature]).toString('base64url');
}

/** `{ version, data }` once the signature checks out against any accepted key, else null. */
async function openToken(kind: TokenKind, token: string): Promise<{ version: number; data: Buffer } | null> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return null;
  }
  const raw = Buffer.from(token, 'base64url');
  if (raw.length < 1 + SIGNATURE_LENGTH) return null;

  const body = raw.subarray(0, raw.length - SIGNATURE_LENGTH);
  const signature = raw.subarray(raw.length - SIGNATURE_LENGTH);
  const message = Buffer.concat([KIND_LABELS[kind], body]);

  for (const key of await verificationKeys()) {
    try {
      if (verify(null, message, key, signature)) {
        return { version: body.readUInt8(0), data: body.subarray(1) };
      }
    } catch {
      // A key of the wrong type just doesn't match.
    }
  }
  return null;
}

// ── Unsubscribe ────────────────────────────────────────────────────────────

/** Unsubscribe v1: the recipient's email address, UTF-8. Never expires. */
export function buildUnsubscribeToken(email: string): Promise<string> {
  return signToken('unsubscribe', UNSUBSCRIBE_V1, Buffer.from(email.trim().toLowerCase(), 'utf8'));
}

/** The email address an unsubscribe token was issued for, or null. */
export async function verifyUnsubscribeToken(token: string): Promise<{ email: string } | null> {
  const opened = await openToken('unsubscribe', token);
  if (!opened || opened.version !== UNSUBSCRIBE_V1) return null;
  const email = opened.data.toString('utf8');
  return email.length > 0 ? { email } : null;
}

// ── Wallet link ────────────────────────────────────────────────────────────

/** Wallet link v1: userId (16 bytes) | eventId (16 bytes). Eligibility is checked when clicked. */
export function buildWalletLinkToken(userId: string, eventId: string): Promise<string> {
  return signToken('wallet', WALLET_V1, Buffer.concat([uuidToBytes(userId), uuidToBytes(eventId)]));
}

export async function verifyWalletLinkToken(token: string): Promise<{ userId: string; eventId: string } | null> {
  const opened = await openToken('wallet', token);
  if (!opened || opened.version !== WALLET_V1) return null;
  if (opened.data.length !== UUID_LENGTH * 2) return null;
  return {
    userId: bytesToUuid(opened.data.subarray(0, UUID_LENGTH)),
    eventId: bytesToUuid(opened.data.subarray(UUID_LENGTH)),
  };
}
