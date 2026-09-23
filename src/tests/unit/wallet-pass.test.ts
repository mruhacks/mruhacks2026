import { describe, it, expect, beforeAll } from 'vitest';
import forge from 'node-forge';
import {
  formatDateRange,
  generateParticipantPass,
  setFieldByKey,
  type PassParticipant,
} from '@/lib/wallet/generate-pass';
import { resolveParticipantName } from '@/lib/wallet/participation';

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
  while (
    offset + 30 <= zip.length &&
    zip.readUInt32LE(offset) === 0x04034b50
  ) {
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

describe('generateParticipantPass relevance', () => {
  beforeAll(() => {
    // Signing only requires PEM-parseable certificates/key — passkit-generator
    // never validates the certificate chain against Apple's real roots — so a
    // throwaway self-signed cert is enough to exercise real signing/zipping.
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

    const certificatePem = forge.pki.certificateToPem(cert);
    process.env.APPLE_WALLET_WWDR_CERT = certificatePem;
    process.env.APPLE_WALLET_SIGNER_CERT = certificatePem;
    process.env.APPLE_WALLET_SIGNER_KEY = forge.pki.privateKeyToPem(
      keys.privateKey,
    );
    delete process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE;
  });

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
