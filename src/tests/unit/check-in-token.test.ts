import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
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
const NAME = 'Thomas Kapocsi';
const EXPIRES_AT = new Date('2026-10-25T23:59:59-06:00');

function generateTestKeyPem(): string {
  const { privateKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return privateKey as unknown as string;
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
  it('is variable length: 1-byte version + 37-byte fixed prefix + name bytes + 64-byte signature', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    const nameBytes = Buffer.byteLength(NAME, 'utf8');
    expect(token.length).toBe(1 + 37 + nameBytes + 64);
  });

  it('starts with a version byte set to 1', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    expect(token.readUInt8(0)).toBe(1);
  });

  it('embeds the raw UUID bytes rather than their hex/dash text form', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    expect(token.subarray(1, 17).toString('hex')).toBe(
      EVENT_ID.replace(/-/g, ''),
    );
    expect(token.subarray(17, 33).toString('hex')).toBe(
      USER_ID.replace(/-/g, ''),
    );
  });

  it('embeds the expiry as a big-endian uint32 of unix seconds', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    expect(token.readUInt32BE(33)).toBe(
      Math.floor(EXPIRES_AT.getTime() / 1000),
    );
  });

  it('embeds a one-byte name length followed by the UTF-8 name', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    const nameLength = token.readUInt8(37);
    expect(nameLength).toBe(Buffer.byteLength(NAME, 'utf8'));
    expect(token.subarray(38, 38 + nameLength).toString('utf8')).toBe(NAME);
  });

  it('is deterministic for identical inputs (Ed25519 signing is deterministic)', () => {
    const a = buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    const b = buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    expect(a.equals(b)).toBe(true);
  });

  it('changes the token when any field changes', () => {
    const base = buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    const otherUser = buildCheckInToken(
      EVENT_ID,
      '00000000-0000-0000-0000-000000000000',
      NAME,
      EXPIRES_AT,
    );
    const otherName = buildCheckInToken(
      EVENT_ID,
      USER_ID,
      'Someone Else',
      EXPIRES_AT,
    );
    const otherExpiry = buildCheckInToken(
      EVENT_ID,
      USER_ID,
      NAME,
      new Date(EXPIRES_AT.getTime() + 1000),
    );
    expect(base.equals(otherUser)).toBe(false);
    expect(base.equals(otherName)).toBe(false);
    expect(base.equals(otherExpiry)).toBe(false);
  });

  it('rejects a malformed UUID', () => {
    expect(() =>
      buildCheckInToken('not-a-uuid', USER_ID, NAME, EXPIRES_AT),
    ).toThrow();
  });

  it('truncates (rather than rejects) an ASCII name longer than 255 bytes', () => {
    const longName = 'x'.repeat(300);
    const token = buildCheckInToken(EVENT_ID, USER_ID, longName, EXPIRES_AT);
    expect(verifyCheckInToken(token)?.name).toBe('x'.repeat(255));
  });

  it('truncates a multi-byte name at a code point boundary, never emitting invalid UTF-8', () => {
    // '李' is 3 bytes in UTF-8: 255 / 3 = 85 exactly, so this exercises the
    // exact-boundary case, not just an easy under/overshoot.
    const longName = '李'.repeat(100); // 300 bytes
    const token = buildCheckInToken(EVENT_ID, USER_ID, longName, EXPIRES_AT);
    const claims = verifyCheckInToken(token);
    expect(claims?.name).toBe('李'.repeat(85));
    expect(Buffer.byteLength(claims!.name, 'utf8')).toBe(255);
  });

  it('varchar(255) full names (255 4-byte characters, 1020 bytes) never throw', () => {
    // Worst case for userProfiles.full_name: Postgres varchar(255) counts
    // characters, not bytes, so this is a legitimately DB-valid full name.
    const maximalDbName = '😀'.repeat(255);
    expect(() =>
      buildCheckInToken(EVENT_ID, USER_ID, maximalDbName, EXPIRES_AT),
    ).not.toThrow();
  });

  it('throws when the signing key is not configured', () => {
    delete process.env.CHECK_IN_SIGNING_PRIVATE_KEY;
    expect(() =>
      buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT),
    ).toThrow(/CHECK_IN_SIGNING_PRIVATE_KEY/);
    process.env.CHECK_IN_SIGNING_PRIVATE_KEY = testKeyPem;
  });

  it('buildCheckInPayload base64url-encodes the same bytes', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    const payload = buildCheckInPayload(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    expect(payload).toBe(token.toString('base64url'));
  });
});

describe('verifyCheckInToken / verifyCheckInPayload', () => {
  it('round-trips through the raw token: build then verify is a nop', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    expect(verifyCheckInToken(token)).toEqual({
      eventId: EVENT_ID,
      userId: USER_ID,
      name: NAME,
      expiresAt: EXPIRES_AT,
    });
  });

  it('round-trips through the base64url payload: build then verify is a nop', () => {
    const payload = buildCheckInPayload(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    expect(verifyCheckInPayload(payload)).toEqual({
      eventId: EVENT_ID,
      userId: USER_ID,
      name: NAME,
      expiresAt: EXPIRES_AT,
    });
  });

  it('round-trips for many random eventId/userId/name/expiry combinations', () => {
    const names = ['Alyssa Bartoletti', '', 'A', '李小龙', 'x'.repeat(255)];
    for (let i = 0; i < 25; i++) {
      const eventId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const name = names[i % names.length];
      // Truncate to whole seconds — that's the token's own precision.
      const expiresAt = new Date(
        Math.floor((Date.now() + i * 1000) / 1000) * 1000,
      );
      const token = buildCheckInToken(eventId, userId, name, expiresAt);
      expect(verifyCheckInToken(token)).toEqual({
        eventId,
        userId,
        name,
        expiresAt,
      });
    }
  });

  it('verifies with only the public key present — no private key at all (the offline-scanner case)', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    const publicKeyPem = createPublicKey(createPrivateKey(testKeyPem))
      .export({ type: 'spki', format: 'pem' })
      .toString();

    delete process.env.CHECK_IN_SIGNING_PRIVATE_KEY;
    process.env.CHECK_IN_SIGNING_PUBLIC_KEY = publicKeyPem;
    try {
      expect(verifyCheckInToken(token)).toEqual({
        eventId: EVENT_ID,
        userId: USER_ID,
        name: NAME,
        expiresAt: EXPIRES_AT,
      });
      // Confirms this really is verify-only: signing has no private key to use.
      expect(() =>
        buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT),
      ).toThrow(/CHECK_IN_SIGNING_PRIVATE_KEY/);
    } finally {
      delete process.env.CHECK_IN_SIGNING_PUBLIC_KEY;
      process.env.CHECK_IN_SIGNING_PRIVATE_KEY = testKeyPem;
    }
  });

  it('rejects a token with a flipped byte', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    token[0] ^= 0xff;
    expect(verifyCheckInToken(token)).toBeNull();
  });

  it('rejects a token signed with a different key', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    process.env.CHECK_IN_SIGNING_PRIVATE_KEY = generateTestKeyPem();
    expect(verifyCheckInToken(token)).toBeNull();
    process.env.CHECK_IN_SIGNING_PRIVATE_KEY = testKeyPem;
  });

  it('rejects a token of the wrong length', () => {
    expect(verifyCheckInToken(Buffer.alloc(10))).toBeNull();
    expect(
      verifyCheckInToken(
        Buffer.concat([
          buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT),
          Buffer.from([0]),
        ]),
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
    const token = buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    // Changing the version invalidates the signature too (it's signed over
    // the version byte), so this also proves version-checking happens
    // before/independently of that — not just relying on the MAC to catch it.
    const tampered = Buffer.from(token);
    tampered[0] = 2;
    expect(verifyCheckInToken(tampered)).toBeNull();
  });
});
