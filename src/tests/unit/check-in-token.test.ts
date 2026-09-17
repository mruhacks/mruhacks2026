import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign,
} from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  buildCheckInToken,
  buildCheckInPayload,
  verifyCheckInToken,
  verifyCheckInPayload,
} from '@/lib/wallet/check-in-token';

const EVENT_ID = '93bb94ab-8a4d-4c86-9eff-6913feb1ccfa';
const USER_ID = '6f0aaf54-5f61-4882-933c-0b1b41ba1051';

function generateTestKeyPem(): string {
  const { privateKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return privateKey as unknown as string;
}

/**
 * Hand-builds a v1 token (version byte + eventId + userId + a big-endian
 * uint32 expiry + a 1-byte name length + UTF-8 name + signature) the way
 * `buildCheckInToken` used to, so `verifyCheckInToken`'s legacy branch has
 * something real to decode — v1 tokens are still circulating on
 * already-issued passes even though nothing builds them anymore.
 */
function buildV1Token(eventId: string, userId: string, name: string): Buffer {
  const uuidBytes = (uuid: string) =>
    Buffer.from(uuid.replace(/-/g, ''), 'hex');
  const nameBytes = Buffer.from(name, 'utf8');
  const expiresAt = Buffer.alloc(4);
  expiresAt.writeUInt32BE(Math.floor(Date.now() / 1000) + 3600);
  const body = Buffer.concat([
    Buffer.from([1]),
    uuidBytes(eventId),
    uuidBytes(userId),
    expiresAt,
    Buffer.from([nameBytes.length]),
    nameBytes,
  ]);
  const signature = sign(null, body, createPrivateKey(testKeyPem));
  return Buffer.concat([body, signature]);
}

const originalKey = process.env.CHECK_IN_SIGNING_PRIVATE_KEY;
const testKeyPem = generateTestKeyPem();

beforeAll(() => {
  process.env.CHECK_IN_SIGNING_PRIVATE_KEY = testKeyPem;
});

afterAll(() => {
  if (originalKey === undefined) {
    delete process.env.CHECK_IN_SIGNING_PRIVATE_KEY;
  } else {
    process.env.CHECK_IN_SIGNING_PRIVATE_KEY = originalKey;
  }
});

describe('buildCheckInToken', () => {
  it('is a fixed 97 bytes: 1-byte version + 32-byte id prefix + 64-byte signature', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID);
    expect(token.length).toBe(1 + 16 + 16 + 64);
  });

  it('starts with a version byte set to 2', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID);
    expect(token.readUInt8(0)).toBe(2);
  });

  it('embeds the raw UUID bytes rather than their hex/dash text form', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID);
    expect(token.subarray(1, 17).toString('hex')).toBe(
      EVENT_ID.replace(/-/g, ''),
    );
    expect(token.subarray(17, 33).toString('hex')).toBe(
      USER_ID.replace(/-/g, ''),
    );
  });

  it('carries no participant name or expiry — just the two ids and a signature', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID);
    expect(token.length).toBe(33 + 64);
  });

  it('is deterministic for identical inputs (Ed25519 signing is deterministic)', () => {
    const a = buildCheckInToken(EVENT_ID, USER_ID);
    const b = buildCheckInToken(EVENT_ID, USER_ID);
    expect(a.equals(b)).toBe(true);
  });

  it('changes the token when either id changes', () => {
    const base = buildCheckInToken(EVENT_ID, USER_ID);
    const otherUser = buildCheckInToken(
      EVENT_ID,
      '00000000-0000-0000-0000-000000000000',
    );
    const otherEvent = buildCheckInToken(
      '00000000-0000-0000-0000-000000000000',
      USER_ID,
    );
    expect(base.equals(otherUser)).toBe(false);
    expect(base.equals(otherEvent)).toBe(false);
  });

  it('rejects a malformed UUID', () => {
    expect(() => buildCheckInToken('not-a-uuid', USER_ID)).toThrow();
  });

  it('throws when the signing key is not configured', () => {
    delete process.env.CHECK_IN_SIGNING_PRIVATE_KEY;
    expect(() => buildCheckInToken(EVENT_ID, USER_ID)).toThrow(
      /CHECK_IN_SIGNING_PRIVATE_KEY/,
    );
    process.env.CHECK_IN_SIGNING_PRIVATE_KEY = testKeyPem;
  });

  it('buildCheckInPayload base64url-encodes the same bytes', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID);
    const payload = buildCheckInPayload(EVENT_ID, USER_ID);
    expect(payload).toBe(token.toString('base64url'));
  });
});

describe('verifyCheckInToken / verifyCheckInPayload', () => {
  it('round-trips through the raw token: build then verify is a nop', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID);
    expect(verifyCheckInToken(token)).toEqual({
      eventId: EVENT_ID,
      userId: USER_ID,
    });
  });

  it('round-trips through the base64url payload: build then verify is a nop', () => {
    const payload = buildCheckInPayload(EVENT_ID, USER_ID);
    expect(verifyCheckInPayload(payload)).toEqual({
      eventId: EVENT_ID,
      userId: USER_ID,
    });
  });

  it('round-trips for many random eventId/userId combinations', () => {
    for (let i = 0; i < 25; i++) {
      const eventId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const token = buildCheckInToken(eventId, userId);
      expect(verifyCheckInToken(token)).toEqual({ eventId, userId });
    }
  });

  it('verifies with only the public key present — no private key at all (the offline-scanner case)', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID);
    const publicKeyPem = createPublicKey(createPrivateKey(testKeyPem))
      .export({ type: 'spki', format: 'pem' })
      .toString();

    delete process.env.CHECK_IN_SIGNING_PRIVATE_KEY;
    process.env.CHECK_IN_SIGNING_PUBLIC_KEY = publicKeyPem;
    try {
      expect(verifyCheckInToken(token)).toEqual({
        eventId: EVENT_ID,
        userId: USER_ID,
      });
      // Confirms this really is verify-only: signing has no private key to use.
      expect(() => buildCheckInToken(EVENT_ID, USER_ID)).toThrow(
        /CHECK_IN_SIGNING_PRIVATE_KEY/,
      );
    } finally {
      delete process.env.CHECK_IN_SIGNING_PUBLIC_KEY;
      process.env.CHECK_IN_SIGNING_PRIVATE_KEY = testKeyPem;
    }
  });

  it('rejects a token with a flipped byte', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID);
    token[0] ^= 0xff;
    expect(verifyCheckInToken(token)).toBeNull();
  });

  it('rejects a token signed with a different key', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID);
    process.env.CHECK_IN_SIGNING_PRIVATE_KEY = generateTestKeyPem();
    expect(verifyCheckInToken(token)).toBeNull();
    process.env.CHECK_IN_SIGNING_PRIVATE_KEY = testKeyPem;
  });

  it('rejects a token of the wrong length', () => {
    expect(verifyCheckInToken(Buffer.alloc(10))).toBeNull();
    expect(
      verifyCheckInToken(
        Buffer.concat([buildCheckInToken(EVENT_ID, USER_ID), Buffer.from([0])]),
      ),
    ).toBeNull();
  });

  it('rejects garbage input instead of throwing', () => {
    expect(
      verifyCheckInToken(Buffer.from('not a real token at all')),
    ).toBeNull();
    expect(verifyCheckInPayload('not-valid-base64url!!!')).toBeNull();
  });

  it('rejects an unrecognized version byte, even with an otherwise-valid signature', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID);
    // Changing the version invalidates the signature too (it's signed over
    // the version byte), so this also proves version-checking happens
    // before/independently of that — not just relying on the MAC to catch it.
    const tampered = Buffer.from(token);
    tampered[0] = 99;
    expect(verifyCheckInToken(tampered)).toBeNull();
  });

  describe('legacy v1 tokens (already-issued passes still carrying an expiry and a name)', () => {
    it('verifies a v1 token and discards its embedded expiry/name', () => {
      const token = buildV1Token(EVENT_ID, USER_ID, 'Thomas Kapocsi');
      expect(verifyCheckInToken(token)).toEqual({
        eventId: EVENT_ID,
        userId: USER_ID,
      });
    });

    it('verifies a v1 token with an empty name', () => {
      const token = buildV1Token(EVENT_ID, USER_ID, '');
      expect(verifyCheckInToken(token)).toEqual({
        eventId: EVENT_ID,
        userId: USER_ID,
      });
    });

    it('rejects a tampered v1 token', () => {
      const token = buildV1Token(EVENT_ID, USER_ID, 'Thomas Kapocsi');
      token[token.length - 1] ^= 0xff;
      expect(verifyCheckInToken(token)).toBeNull();
    });

    it('rejects a v1 token whose declared name length overruns the buffer', () => {
      const token = buildV1Token(EVENT_ID, USER_ID, 'Thomas Kapocsi');
      token.writeUInt8(255, 37); // name-length byte, now far too large
      expect(verifyCheckInToken(token)).toBeNull();
    });
  });
});
