import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
  type Result,
} from '@zxing/library';
import QRCode from 'qrcode';
import { generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { payloadFromResult } from '@/app/dashboard/admin/events/[eventId]/@checkin/scan-payload';
import {
  buildCheckInPayload,
  buildCheckInToken,
} from '@/lib/wallet/check-in-token';
import { readScannedToken } from '@/lib/wallet/scanned-token';

const EVENT_ID = '12fb1fbc-df26-4693-9172-ab75a6b25952';
const USER_ID = '8a21582f-4fbe-4959-a5b8-3db8ddff1535';
const NAME = 'Thomas Kapocsi';
const EXPIRES_AT = new Date('2026-09-17T00:00:00Z');

const { privateKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const originalKey = process.env.CHECK_IN_SIGNING_PRIVATE_KEY;

beforeAll(() => {
  process.env.CHECK_IN_SIGNING_PRIVATE_KEY = privateKey as unknown as string;
});

afterAll(() => {
  if (originalKey === undefined) {
    delete process.env.CHECK_IN_SIGNING_PRIVATE_KEY;
  } else {
    process.env.CHECK_IN_SIGNING_PRIVATE_KEY = originalKey;
  }
});

/** Renders a QR to a luminance bitmap and decodes it the way the camera does,
 *  so these tests exercise real segment metadata rather than a hand-built
 *  stand-in for it. */
function scan(qr: QRCode.QRCode): Result {
  const { size, data } = qr.modules;
  const quietZone = 4;
  const scale = 3;
  const dimension = (size + quietZone * 2) * scale;
  const luminances = new Uint8ClampedArray(dimension * dimension).fill(255);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y * size + x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const row = (y + quietZone) * scale + dy;
          const column = (x + quietZone) * scale + dx;
          luminances[row * dimension + column] = 0;
        }
      }
    }
  }

  const bitmap = new BinaryBitmap(
    new HybridBinarizer(
      new RGBLuminanceSource(luminances, dimension, dimension),
    ),
  );
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  return new MultiFormatReader().decode(bitmap, hints);
}

describe('payloadFromResult', () => {
  // Built per test, not once at collection time: the signing key only exists
  // from `beforeAll` onwards.
  const buildPayload = () =>
    buildCheckInPayload(EVENT_ID, USER_ID, NAME, EXPIRES_AT);

  it('reads a pass whose encoder split the payload across QR modes', () => {
    // Apple Wallet's encoder does this: the payload's leading characters fit
    // alphanumeric mode, so they land outside BYTE_SEGMENTS entirely.
    const qr = QRCode.create(buildPayload(), { errorCorrectionLevel: 'M' });
    expect(qr.segments.map((segment) => segment.mode.id)).toEqual([
      'Alphanumeric',
      'Byte',
    ]);

    const claims = readScannedToken(payloadFromResult(scan(qr)));
    expect(claims?.userId).toBe(USER_ID);
    expect(claims?.name).toBe(NAME);
  });

  it('reads a pass encoded as a single byte segment', () => {
    // What Google Wallet emits for the same string.
    // Byte-mode segments are typed as bytes; the ASCII payload is the same
    // either way.
    const qr = QRCode.create(
      [{ data: Buffer.from(buildPayload()), mode: 'byte' }],
      {
        errorCorrectionLevel: 'M',
      },
    );
    expect(qr.segments.map((segment) => segment.mode.id)).toEqual(['Byte']);

    const claims = readScannedToken(payloadFromResult(scan(qr)));
    expect(claims?.userId).toBe(USER_ID);
    expect(claims?.name).toBe(NAME);
  });

  it('reads the in-app QR, which encodes the raw token bytes rather than text', () => {
    const token = buildCheckInToken(EVENT_ID, USER_ID, NAME, EXPIRES_AT);
    const qr = QRCode.create([{ data: token, mode: 'byte' }], {
      errorCorrectionLevel: 'M',
    });

    const claims = readScannedToken(payloadFromResult(scan(qr)));
    expect(claims?.userId).toBe(USER_ID);
    expect(claims?.name).toBe(NAME);
  });
});
