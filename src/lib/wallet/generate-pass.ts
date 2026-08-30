import 'server-only';

import path from 'node:path';

import { PKPass } from 'passkit-generator';

import { buildCheckInPayload, DEFAULT_QR_TTL_MS } from './check-in-token';
import { formatDateRange } from './format';

export { formatDateRange } from './format';

const MODEL_PATH = path.join(
  process.cwd(),
  'src',
  'lib',
  'wallet',
  'mruhacks.pass',
);

export type PassParticipant = {
  eventId: string;
  userId: string;
  name: string;
  role: string;
  eventName: string;
  startsAt: Date | null;
  endsAt: Date | null;
  location: string | null;
  /** Geofence center; all three are set together or not at all. */
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  expiresAt: Date | null;
};

function readCertificate(name: string): Buffer {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is required to sign Apple Wallet passes; see .env.example`,
    );
  }
  return value.startsWith('-----BEGIN')
    ? Buffer.from(value, 'utf8')
    : Buffer.from(value, 'base64');
}

function getCertificates() {
  const passphrase = process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE?.trim();
  return {
    wwdr: readCertificate('APPLE_WALLET_WWDR_CERT'),
    signerCert: readCertificate('APPLE_WALLET_SIGNER_CERT'),
    signerKey: readCertificate('APPLE_WALLET_SIGNER_KEY'),
    ...(passphrase ? { signerKeyPassphrase: passphrase } : {}),
  };
}

/** Overwrites a field's value by key, or removes it if `value` is null. */
export function setFieldByKey<T extends { key: string; value: unknown }>(
  fields: T[],
  key: string,
  value: string | null,
): void {
  const index = fields.findIndex((field) => field.key === key);
  if (value === null) {
    if (index !== -1) fields.splice(index, 1);
    return;
  }
  if (index !== -1) {
    fields[index].value = value;
  }
}

export async function generateParticipantPass(
  participant: PassParticipant,
): Promise<Buffer> {
  const expiresAt =
    participant.expiresAt ?? new Date(Date.now() + DEFAULT_QR_TTL_MS);
  const serialNumber = `${participant.eventId}:${participant.userId}`;

  const geofence =
    participant.latitude != null &&
    participant.longitude != null &&
    participant.radiusMeters != null
      ? {
          latitude: participant.latitude,
          longitude: participant.longitude,
          radiusMeters: participant.radiusMeters,
        }
      : null;

  const pass = await PKPass.from(
    { model: MODEL_PATH, certificates: getCertificates() },
    {
      serialNumber,
      description: `${participant.eventName} Participant Pass`,
      ...(geofence ? { maxDistance: geofence.radiusMeters } : {}),
    },
  );

  if (pass.props.serialNumber !== serialNumber) {
    throw new Error(
      `Pass serial number was not applied for event ${participant.eventId}`,
    );
  }

  setFieldByKey(pass.primaryFields, 'event', participant.eventName);
  setFieldByKey(
    pass.auxiliaryFields,
    'dates',
    formatDateRange(participant.startsAt, participant.endsAt),
  );
  setFieldByKey(pass.auxiliaryFields, 'venue', participant.location);

  pass.secondaryFields.push(
    { key: 'name', label: 'NAME', value: participant.name },
    { key: 'role', label: 'ROLE', value: participant.role },
  );

  pass.backFields.push({
    key: 'ticketid',
    label: 'TICKET ID',
    value: serialNumber,
  });

  if (geofence) {
    pass.setLocations({
      latitude: geofence.latitude,
      longitude: geofence.longitude,
      relevantText: `Show this pass at check-in for ${participant.eventName}.`,
    });
  }

  const relevantDate = participant.startsAt ?? participant.endsAt;
  if (participant.startsAt && participant.endsAt) {
    pass.setRelevantDates([
      { startDate: participant.startsAt, endDate: participant.endsAt },
    ]);
  } else if (relevantDate) {
    pass.setRelevantDate(relevantDate);
  }

  pass.setBarcodes(
    buildCheckInPayload(
      participant.eventId,
      participant.userId,
      participant.name,
      expiresAt,
    ),
  );
  pass.setExpirationDate(expiresAt);

  return pass.getAsBuffer();
}
