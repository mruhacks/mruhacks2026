import 'server-only';

import { createHmac } from 'node:crypto';
import path from 'node:path';

import { PKPass } from 'passkit-generator';

const MODEL_PATH = path.join(
  process.cwd(),
  'src',
  'lib',
  'wallet',
  'mruhacks.pass',
);

const DEFAULT_QR_TTL_MS = 24 * 60 * 60 * 1000;

export type PassParticipant = {
  applicationId: string;
  name: string;
  role: string;
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

function buildCheckInPayload(applicationId: string, expiresAt: Date): string {
  const secret = process.env.APPLE_WALLET_QR_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'APPLE_WALLET_QR_SECRET is required to sign check-in QR codes; see .env.example',
    );
  }

  const body = `${applicationId}.${Date.now()}.${expiresAt.getTime()}`;
  const signature = createHmac('sha256', secret)
    .update(body)
    .digest('base64url');
  return `${body}.${signature}`;
}

export async function generateParticipantPass(
  participant: PassParticipant,
): Promise<Buffer> {
  const expiresAt =
    participant.expiresAt ?? new Date(Date.now() + DEFAULT_QR_TTL_MS);

  const pass = await PKPass.from(
    { model: MODEL_PATH, certificates: getCertificates() },
    { serialNumber: participant.applicationId },
  );

  if (pass.props.serialNumber !== participant.applicationId) {
    throw new Error(
      `Pass serial number was not applied for application ${participant.applicationId}`,
    );
  }

  pass.secondaryFields.push(
    { key: 'name', label: 'NAME', value: participant.name },
    { key: 'role', label: 'ROLE', value: participant.role },
  );

  pass.backFields.push({
    key: 'ticketid',
    label: 'TICKET ID',
    value: participant.applicationId,
  });

  pass.setBarcodes(buildCheckInPayload(participant.applicationId, expiresAt));
  pass.setExpirationDate(expiresAt);

  return pass.getAsBuffer();
}
