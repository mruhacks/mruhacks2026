import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import forge from 'node-forge';
import {
  formatDateRange,
  generateParticipantPass,
  setFieldByKey,
  type PassParticipant,
} from '@/lib/wallet/generate-pass';
import { resolveParticipantName } from '@/lib/wallet/participation';
import {
  buildCheckInPayload,
  DEFAULT_QR_TTL_MS,
} from '@/lib/wallet/check-in-token';

describe('formatDateRange', () => {
  it('returns null when neither date is set', () => {
    expect(formatDateRange(null, null)).toBeNull();
  });

  it('formats a same-year range without repeating the year on the start date', () => {
    const startsAt = new Date('2026-10-23T09:00:00-06:00');
    const endsAt = new Date('2026-10-25T23:59:59-06:00');
    expect(formatDateRange(startsAt, endsAt)).toBe('Oct 23–Oct 25, 2026');
  });

  it('formats a same-day event as a time range rather than a repeated date', () => {
    const startsAt = new Date('2026-09-16T09:00:00-06:00');
    const endsAt = new Date('2026-09-16T17:00:00-06:00');
    expect(formatDateRange(startsAt, endsAt)).toBe('Sep 16, 9:00 AM–5:00 PM');
  });

  it('treats the venue day, not the UTC day, as the same day', () => {
    // 6pm-11pm MDT is already the next day in UTC.
    const startsAt = new Date('2026-09-16T18:00:00-06:00');
    const endsAt = new Date('2026-09-16T23:00:00-06:00');
    expect(formatDateRange(startsAt, endsAt)).toBe('Sep 16, 6:00 PM–11:00 PM');
  });

  it('prints one time when a same-day event starts and ends at the same instant', () => {
    const at = new Date('2026-09-16T09:00:00-06:00');
    expect(formatDateRange(at, at)).toBe('Sep 16, 9:00 AM');
  });

  it('includes the year on both ends of a cross-year range', () => {
    const startsAt = new Date('2026-12-31T09:00:00-07:00');
    const endsAt = new Date('2027-01-02T23:59:59-07:00');
    expect(formatDateRange(startsAt, endsAt)).toBe('Dec 31, 2026–Jan 2, 2027');
  });

  it('formats a single date when only the start is known', () => {
    const startsAt = new Date('2026-10-23T09:00:00-06:00');
    expect(formatDateRange(startsAt, null)).toBe('Oct 23, 2026');
  });

  it('formats a single date when only the end is known', () => {
    const endsAt = new Date('2026-10-25T23:59:59-06:00');
    expect(formatDateRange(null, endsAt)).toBe('Oct 25, 2026');
  });
});

/**
 * `.pkpass` files are ZIP archives. passkit-generator builds them via
 * `do-not-zip`, which always stores entries uncompressed (method 0), so a
 * minimal reader that walks local file headers is enough — no inflate
 * needed.
 */
function readZipEntry(zip: Buffer, fileName: string): Buffer {
  let offset = 0;
  while (offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const compressionMethod = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = zip.toString('utf8', nameStart, nameStart + nameLength);

    if (compressionMethod !== 0) {
      throw new Error(`Unexpected compression method for ${name}`);
    }
    if (name === fileName) {
      return zip.subarray(dataStart, dataStart + compressedSize);
    }
    offset = dataStart + compressedSize;
  }
  throw new Error(`${fileName} not found in zip`);
}

function readPassJson(pkpass: Buffer): Record<string, unknown> {
  return JSON.parse(readZipEntry(pkpass, 'pass.json').toString('utf8'));
}

const BASE_PARTICIPANT: PassParticipant = {
  eventId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  name: 'Jane Doe',
  role: 'Participant',
  eventName: 'MRUHacks 2026',
  startsAt: null,
  endsAt: null,
  location: 'Main Hall',
  latitude: null,
  longitude: null,
  radiusMeters: null,
  expiresAt: new Date('2026-12-31T00:00:00Z'),
};

/**
 * Signing only requires PEM-parseable certificates/key — passkit-generator
 * never validates the certificate chain against Apple's real roots — so a
 * throwaway self-signed cert is enough to exercise real signing/zipping.
 */
function generateSelfSignedCertificate(): {
  certificatePem: string;
  privateKey: forge.pki.rsa.PrivateKey;
  privateKeyPem: string;
} {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: 'commonName', value: 'MRUHacks Test' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    certificatePem: forge.pki.certificateToPem(cert),
    privateKey: keys.privateKey,
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

/** Temporarily overrides `process.env` entries for the duration of `fn`, restoring them afterward (even on throw). */
async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    original[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('generateParticipantPass', () => {
  let certificatePem: string;
  let privateKeyPem: string;

  beforeAll(() => {
    const cert = generateSelfSignedCertificate();
    certificatePem = cert.certificatePem;
    privateKeyPem = cert.privateKeyPem;

    process.env.APPLE_WALLET_WWDR_CERT = certificatePem;
    process.env.APPLE_WALLET_SIGNER_CERT = certificatePem;
    process.env.APPLE_WALLET_SIGNER_KEY = privateKeyPem;
    delete process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE;

    // The barcode is a check-in token signed with this key (see
    // check-in-token.ts) — mocked here too so the suite doesn't depend on
    // CHECK_IN_SIGNING_PRIVATE_KEY being set in the environment it runs in.
    const { privateKey } = generateKeyPairSync('ed25519');
    process.env.CHECK_IN_SIGNING_PRIVATE_KEY = privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();
    delete process.env.CHECK_IN_SIGNING_PUBLIC_KEY;
  });

  describe('relevance window', () => {
    it('makes the pass relevant 15 minutes before the event start, keeping the real end date', async () => {
      const startsAt = new Date('2026-10-23T09:00:00-06:00');
      const endsAt = new Date('2026-10-23T17:00:00-06:00');

      const pkpass = await generateParticipantPass({
        ...BASE_PARTICIPANT,
        startsAt,
        endsAt,
      });
      const passJson = readPassJson(pkpass);

      expect(passJson.relevantDate).toBeUndefined();
      expect(passJson.relevantDates).toEqual([
        {
          startDate: new Date('2026-10-23T08:45:00-06:00').toISOString(),
          endDate: endsAt.toISOString(),
        },
      ]);
    });

    it('starts relevance 15 minutes early when only the start is known', async () => {
      const startsAt = new Date('2026-10-23T09:00:00-06:00');

      const pkpass = await generateParticipantPass({
        ...BASE_PARTICIPANT,
        startsAt,
        endsAt: null,
      });
      const passJson = readPassJson(pkpass);

      expect(passJson.relevantDates).toBeUndefined();
      expect(passJson.relevantDate).toBe(
        new Date('2026-10-23T08:45:00-06:00').toISOString(),
      );
    });

    it('leaves the relevant date unshifted when only the end is known', async () => {
      const endsAt = new Date('2026-10-23T17:00:00-06:00');

      const pkpass = await generateParticipantPass({
        ...BASE_PARTICIPANT,
        startsAt: null,
        endsAt,
      });
      const passJson = readPassJson(pkpass);

      expect(passJson.relevantDates).toBeUndefined();
      expect(passJson.relevantDate).toBe(endsAt.toISOString());
    });

    it('sets no relevance date when neither is known', async () => {
      const pkpass = await generateParticipantPass({
        ...BASE_PARTICIPANT,
        startsAt: null,
        endsAt: null,
      });
      const passJson = readPassJson(pkpass);

      expect(passJson.relevantDate).toBeUndefined();
      expect(passJson.relevantDates).toBeUndefined();
    });
  });

  describe('identity and fields', () => {
    it('derives the serial number from eventId:userId', async () => {
      const pkpass = await generateParticipantPass(BASE_PARTICIPANT);
      const passJson = readPassJson(pkpass);

      expect(passJson.serialNumber).toBe(
        `${BASE_PARTICIPANT.eventId}:${BASE_PARTICIPANT.userId}`,
      );
      expect(passJson.description).toBe(
        `${BASE_PARTICIPANT.eventName} Participant Pass`,
      );
    });

    it('writes the event name into the primary field', async () => {
      const pkpass = await generateParticipantPass({
        ...BASE_PARTICIPANT,
        eventName: 'Winter Jam',
      });
      const passJson = readPassJson(pkpass);

      expect(
        (passJson.generic as { primaryFields: unknown }).primaryFields,
      ).toEqual([{ key: 'event', label: 'EVENT', value: 'Winter Jam' }]);
    });

    it('writes the formatted date range into the auxiliary dates field', async () => {
      const startsAt = new Date('2026-10-23T09:00:00-06:00');
      const endsAt = new Date('2026-10-23T17:00:00-06:00');

      const pkpass = await generateParticipantPass({
        ...BASE_PARTICIPANT,
        startsAt,
        endsAt,
      });
      const passJson = readPassJson(pkpass);
      const auxiliaryFields = (
        passJson.generic as { auxiliaryFields: { key: string }[] }
      ).auxiliaryFields;

      expect(auxiliaryFields.find((f) => f.key === 'dates')).toEqual({
        key: 'dates',
        label: 'DATES',
        value: formatDateRange(startsAt, endsAt),
      });
    });

    it('writes the location into the auxiliary venue field', async () => {
      const pkpass = await generateParticipantPass({
        ...BASE_PARTICIPANT,
        location: 'Riddell Library',
      });
      const passJson = readPassJson(pkpass);
      const auxiliaryFields = (
        passJson.generic as { auxiliaryFields: { key: string }[] }
      ).auxiliaryFields;

      expect(auxiliaryFields.find((f) => f.key === 'venue')).toEqual({
        key: 'venue',
        label: 'VENUE',
        value: 'Riddell Library',
      });
    });

    it('drops the venue field entirely when location is null', async () => {
      const pkpass = await generateParticipantPass({
        ...BASE_PARTICIPANT,
        location: null,
      });
      const passJson = readPassJson(pkpass);
      const auxiliaryFields = (
        passJson.generic as { auxiliaryFields: { key: string }[] }
      ).auxiliaryFields;

      expect(auxiliaryFields.find((f) => f.key === 'venue')).toBeUndefined();
    });

    it('includes the participant name and role as secondary fields', async () => {
      const pkpass = await generateParticipantPass({
        ...BASE_PARTICIPANT,
        name: 'Jordan Lee',
        role: 'Volunteer',
      });
      const passJson = readPassJson(pkpass);

      expect(
        (passJson.generic as { secondaryFields: unknown }).secondaryFields,
      ).toEqual([
        { key: 'name', label: 'NAME', value: 'Jordan Lee' },
        { key: 'role', label: 'ROLE', value: 'Volunteer' },
      ]);
    });

    it('includes the serial number as the ticket id back field', async () => {
      const pkpass = await generateParticipantPass(BASE_PARTICIPANT);
      const passJson = readPassJson(pkpass);

      expect((passJson.generic as { backFields: unknown }).backFields).toEqual([
        {
          key: 'ticketid',
          label: 'TICKET ID',
          value: `${BASE_PARTICIPANT.eventId}:${BASE_PARTICIPANT.userId}`,
        },
      ]);
    });
  });

  describe('geofence', () => {
    it('sets a pass location and maxDistance when latitude, longitude and radius are all present', async () => {
      const pkpass = await generateParticipantPass({
        ...BASE_PARTICIPANT,
        eventName: 'MRUHacks 2026',
        latitude: 51.0447,
        longitude: -114.0719,
        radiusMeters: 150,
      });
      const passJson = readPassJson(pkpass);

      expect(passJson.maxDistance).toBe(150);
      expect(passJson.locations).toEqual([
        {
          latitude: 51.0447,
          longitude: -114.0719,
          relevantText: 'Show this pass at check-in for MRUHacks 2026.',
        },
      ]);
    });

    it('omits location and maxDistance when only some geofence fields are present', async () => {
      const pkpass = await generateParticipantPass({
        ...BASE_PARTICIPANT,
        latitude: 51.0447,
        longitude: -114.0719,
        radiusMeters: null,
      });
      const passJson = readPassJson(pkpass);

      expect(passJson.maxDistance).toBeUndefined();
      expect(passJson.locations).toBeUndefined();
    });

    it('omits location and maxDistance when no geofence fields are present', async () => {
      const pkpass = await generateParticipantPass(BASE_PARTICIPANT);
      const passJson = readPassJson(pkpass);

      expect(passJson.maxDistance).toBeUndefined();
      expect(passJson.locations).toBeUndefined();
    });
  });

  describe('barcode', () => {
    it('encodes the signed check-in payload as an Aztec barcode with explicit iso-8859-1 encoding', async () => {
      const pkpass = await generateParticipantPass(BASE_PARTICIPANT);
      const passJson = readPassJson(pkpass);

      expect(passJson.barcodes).toEqual([
        {
          format: 'PKBarcodeFormatAztec',
          message: buildCheckInPayload(
            BASE_PARTICIPANT.eventId,
            BASE_PARTICIPANT.userId,
          ),
          messageEncoding: 'iso-8859-1',
        },
      ]);
    });
  });

  describe('expiration', () => {
    it('uses the provided expiresAt as the pass expiration date', async () => {
      const expiresAt = new Date('2026-11-01T00:00:00Z');

      const pkpass = await generateParticipantPass({
        ...BASE_PARTICIPANT,
        expiresAt,
      });
      const passJson = readPassJson(pkpass);

      expect(passJson.expirationDate).toBe(expiresAt.toISOString());
    });

    it('falls back to now + DEFAULT_QR_TTL_MS when expiresAt is null', async () => {
      const before = Date.now();
      const pkpass = await generateParticipantPass({
        ...BASE_PARTICIPANT,
        expiresAt: null,
      });
      const after = Date.now();
      const passJson = readPassJson(pkpass);

      const expirationMs = new Date(
        passJson.expirationDate as string,
      ).getTime();
      expect(expirationMs).toBeGreaterThanOrEqual(before + DEFAULT_QR_TTL_MS);
      expect(expirationMs).toBeLessThanOrEqual(after + DEFAULT_QR_TTL_MS);
    });
  });

  describe('certificate handling', () => {
    it('accepts base64-encoded certificates and key, not just raw PEM', async () => {
      await withEnv(
        {
          APPLE_WALLET_WWDR_CERT:
            Buffer.from(certificatePem).toString('base64'),
          APPLE_WALLET_SIGNER_CERT:
            Buffer.from(certificatePem).toString('base64'),
          APPLE_WALLET_SIGNER_KEY:
            Buffer.from(privateKeyPem).toString('base64'),
        },
        async () => {
          const pkpass = await generateParticipantPass(BASE_PARTICIPANT);
          const passJson = readPassJson(pkpass);
          expect(passJson.serialNumber).toBe(
            `${BASE_PARTICIPANT.eventId}:${BASE_PARTICIPANT.userId}`,
          );
        },
      );
    });

    it('supports a passphrase-protected signer key', async () => {
      const { privateKey } = generateSelfSignedCertificate();
      const encryptedKeyPem = forge.pki.encryptRsaPrivateKey(
        privateKey,
        'correct horse battery staple',
        { algorithm: 'aes256' },
      );

      await withEnv(
        {
          APPLE_WALLET_SIGNER_KEY: encryptedKeyPem,
          APPLE_WALLET_SIGNER_KEY_PASSPHRASE: 'correct horse battery staple',
        },
        async () => {
          const pkpass = await generateParticipantPass(BASE_PARTICIPANT);
          const passJson = readPassJson(pkpass);
          expect(passJson.serialNumber).toBe(
            `${BASE_PARTICIPANT.eventId}:${BASE_PARTICIPANT.userId}`,
          );
        },
      );
    });

    it.each([
      ['APPLE_WALLET_WWDR_CERT'],
      ['APPLE_WALLET_SIGNER_CERT'],
      ['APPLE_WALLET_SIGNER_KEY'],
    ])('throws a descriptive error when %s is missing', async (envVar) => {
      await withEnv({ [envVar]: undefined }, async () => {
        await expect(generateParticipantPass(BASE_PARTICIPANT)).rejects.toThrow(
          `${envVar} is required to sign Apple Wallet passes`,
        );
      });
    });

    it.each([
      ['APPLE_WALLET_WWDR_CERT'],
      ['APPLE_WALLET_SIGNER_CERT'],
      ['APPLE_WALLET_SIGNER_KEY'],
    ])('throws a descriptive error when %s is blank', async (envVar) => {
      await withEnv({ [envVar]: '   ' }, async () => {
        await expect(generateParticipantPass(BASE_PARTICIPANT)).rejects.toThrow(
          `${envVar} is required to sign Apple Wallet passes`,
        );
      });
    });
  });
});

describe('setFieldByKey', () => {
  it('overwrites the value of an existing field', () => {
    const fields = [{ key: 'event', label: 'EVENT', value: 'placeholder' }];
    setFieldByKey(fields, 'event', 'MRUHacks 2026');
    expect(fields).toEqual([
      { key: 'event', label: 'EVENT', value: 'MRUHacks 2026' },
    ]);
  });

  it('removes the field when value is null', () => {
    const fields = [
      { key: 'dates', label: 'DATES', value: 'placeholder' },
      { key: 'venue', label: 'VENUE', value: 'placeholder' },
    ];
    setFieldByKey(fields, 'venue', null);
    expect(fields).toEqual([
      { key: 'dates', label: 'DATES', value: 'placeholder' },
    ]);
  });

  it('is a no-op when the key is not found and value is non-null', () => {
    const fields = [{ key: 'dates', label: 'DATES', value: 'placeholder' }];
    setFieldByKey(fields, 'missing', 'value');
    expect(fields).toEqual([
      { key: 'dates', label: 'DATES', value: 'placeholder' },
    ]);
  });

  it('is a no-op when the key is not found and value is null', () => {
    const fields = [{ key: 'dates', label: 'DATES', value: 'placeholder' }];
    setFieldByKey(fields, 'missing', null);
    expect(fields).toEqual([
      { key: 'dates', label: 'DATES', value: 'placeholder' },
    ]);
  });
});

describe('resolveParticipantName', () => {
  it('prefers the profile full name when set', () => {
    expect(resolveParticipantName('Jane Doe', 'jdoe')).toBe('Jane Doe');
  });

  it('falls back to the account name when there is no profile', () => {
    expect(resolveParticipantName(null, 'jdoe')).toBe('jdoe');
  });

  it('falls back to the account name when the profile name is empty', () => {
    expect(resolveParticipantName('', 'jdoe')).toBe('jdoe');
  });

  it('falls back to a generic label when neither name is set', () => {
    expect(resolveParticipantName(null, '')).toBe('Participant');
  });
});
