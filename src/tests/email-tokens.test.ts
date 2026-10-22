import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { eq, isNull } from 'drizzle-orm';

import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import * as Signing from '@/lib/signing/server';

const USER_ID = '6f0aaf54-5f61-4882-933c-0b1b41ba1051';
const EVENT_ID = '93bb94ab-8a4d-4c86-9eff-6913feb1ccfa';

const SIGNING_ENV = [
  'APP_SIGNING_PRIVATE_KEY',
  'APP_SIGNING_PUBLIC_KEY',
  'CHECK_IN_SIGNING_PRIVATE_KEY',
  'CHECK_IN_SIGNING_PUBLIC_KEY',
] as const;
const originalEnv = Object.fromEntries(SIGNING_ENV.map((name) => [name, process.env[name]]));

function newKeyPem(): string {
  const { privateKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return privateKey as unknown as string;
}

function useKey(pem: string) {
  for (const name of SIGNING_ENV) delete process.env[name];
  process.env.APP_SIGNING_PRIVATE_KEY = pem;
}

/** Re-signs `version | data` under the unsubscribe label, as a future version might. */
function forgeUnsubscribe(pem: string, version: number, data: string): string {
  const body = Buffer.concat([Buffer.from([version]), Buffer.from(data)]);
  const signature = sign(null, Buffer.concat([Buffer.from('mruhacks:unsubscribe\0'), body]), createPrivateKey(pem));
  return Buffer.concat([body, signature]).toString('base64url');
}

beforeEach(async () => {
  await db.delete(schema.signingPublicKeys);
  useKey(newKeyPem());
});

afterAll(async () => {
  await db.delete(schema.signingPublicKeys);
  for (const name of SIGNING_ENV) {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('unsubscribe tokens', () => {
  test('round-trip, normalizing the address', async () => {
    const token = await Signing.buildUnsubscribeToken(' Person@Example.com ');
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await Signing.verifyUnsubscribeToken(token)).toEqual({
      email: 'person@example.com',
    });
  });

  test('a tampered address or signature is rejected', async () => {
    const token = Buffer.from(await Signing.buildUnsubscribeToken('a@example.com'), 'base64url');
    const data = Buffer.from(token);
    data[1] ^= 0x01;
    expect(await Signing.verifyUnsubscribeToken(data.toString('base64url'))).toBeNull();
    const sig = Buffer.from(token);
    sig[sig.length - 1] ^= 0x01;
    expect(await Signing.verifyUnsubscribeToken(sig.toString('base64url'))).toBeNull();
  });

  test('an unknown version is rejected even with a valid signature', async () => {
    const pem = newKeyPem();
    useKey(pem);
    // Record the key the way a real sign would.
    await Signing.buildUnsubscribeToken('x@example.com');
    expect(await Signing.verifyUnsubscribeToken(forgeUnsubscribe(pem, 1, 'v@example.com'))).toEqual({
      email: 'v@example.com',
    });
    expect(await Signing.verifyUnsubscribeToken(forgeUnsubscribe(pem, 2, 'v@example.com'))).toBeNull();
  });

  test('garbage is rejected', async () => {
    expect(await Signing.verifyUnsubscribeToken('')).toBeNull();
    expect(await Signing.verifyUnsubscribeToken('not base64!')).toBeNull();
    expect(await Signing.verifyUnsubscribeToken('AAAA')).toBeNull();
  });

  test("a wallet token can't be used as an unsubscribe token", async () => {
    const wallet = await Signing.buildWalletLinkToken(USER_ID, EVENT_ID);
    expect(await Signing.verifyUnsubscribeToken(wallet)).toBeNull();
  });
});

describe('wallet link tokens', () => {
  test('round-trip', async () => {
    const token = await Signing.buildWalletLinkToken(USER_ID, EVENT_ID);
    expect(await Signing.verifyWalletLinkToken(token)).toEqual({
      userId: USER_ID,
      eventId: EVENT_ID,
    });
  });

  test('tampered ids are rejected', async () => {
    const token = Buffer.from(await Signing.buildWalletLinkToken(USER_ID, EVENT_ID), 'base64url');
    token[5] ^= 0x01;
    expect(await Signing.verifyWalletLinkToken(token.toString('base64url'))).toBeNull();
  });

  test("an unsubscribe token can't be used as a wallet token", async () => {
    const unsubscribe = await Signing.buildUnsubscribeToken('a@example.com');
    expect(await Signing.verifyWalletLinkToken(unsubscribe)).toBeNull();
  });
});

describe('stored public keys', () => {
  test('signing records the current public key once', async () => {
    await Signing.buildUnsubscribeToken('a@example.com');
    await Signing.buildUnsubscribeToken('b@example.com');
    const rows = await db.select().from(schema.signingPublicKeys);
    expect(rows).toHaveLength(1);
    expect(rows[0].publicKey).toContain('BEGIN PUBLIC KEY');
    expect(rows[0].revokedAt).toBeNull();
  });

  test('a token signed with key A still verifies after rotating to key B, until A is revoked', async () => {
    const keyA = newKeyPem();
    useKey(keyA);
    const unsubscribe = await Signing.buildUnsubscribeToken('rotate@example.com');
    const wallet = await Signing.buildWalletLinkToken(USER_ID, EVENT_ID);

    useKey(newKeyPem());
    // Signing with B records it alongside A.
    await Signing.buildUnsubscribeToken('other@example.com');
    expect(await db.select().from(schema.signingPublicKeys)).toHaveLength(2);

    expect(await Signing.verifyUnsubscribeToken(unsubscribe)).toEqual({
      email: 'rotate@example.com',
    });
    expect(await Signing.verifyWalletLinkToken(wallet)).toEqual({
      userId: USER_ID,
      eventId: EVENT_ID,
    });

    // Revoke A: every key other than the current one.
    const [current] = await db
      .select()
      .from(schema.signingPublicKeys)
      .orderBy(schema.signingPublicKeys.firstUsedAt, schema.signingPublicKeys.id);
    await db
      .update(schema.signingPublicKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.signingPublicKeys.id, current.id));
    expect(
      await db.select().from(schema.signingPublicKeys).where(isNull(schema.signingPublicKeys.revokedAt)),
    ).toHaveLength(1);

    expect(await Signing.verifyUnsubscribeToken(unsubscribe)).toBeNull();
    expect(await Signing.verifyWalletLinkToken(wallet)).toBeNull();
  });

  test('revoking the current key stops its tokens verifying too', async () => {
    const token = await Signing.buildUnsubscribeToken('current@example.com');
    await db.update(schema.signingPublicKeys).set({ revokedAt: new Date() });
    expect(await Signing.verifyUnsubscribeToken(token)).toBeNull();
  });

  test('a token from an unrecorded, unconfigured key is rejected', async () => {
    const token = await Signing.buildUnsubscribeToken('gone@example.com');
    await db.delete(schema.signingPublicKeys);
    useKey(newKeyPem());
    expect(await Signing.verifyUnsubscribeToken(token)).toBeNull();
  });
});
