import 'server-only';

import jwt from 'jsonwebtoken';

import { MRUHACKS_LOGO_URL } from '@/content';
import { walletApiRequest } from './client';
import { getGoogleWalletConfig } from './config';

export type GoogleWalletParticipant = {
  eventId: string;
  userId: string;
  name: string;
  eventName: string;
  startsAt: Date | null;
  endsAt: Date | null;
  location: string | null;
  /** Same signed payload as the Apple pass's barcode / the standalone QR code. */
  checkInPayload: string;
};

const LANGUAGE = 'en-US';

function localizedString(value: string) {
  return { defaultValue: { language: LANGUAGE, value } };
}

/** Restricts which origin's "Save to Wallet" button may use the signed JWT. */
function getSiteUrl(): string {
  const url = process.env.BETTER_AUTH_URL?.trim();
  if (!url) {
    throw new Error(
      'BETTER_AUTH_URL is required to build Google Wallet passes',
    );
  }
  return url;
}

function eventTicketClassId(issuerId: string, eventId: string): string {
  return `${issuerId}.event-${eventId}`;
}

function eventTicketObjectId(
  issuerId: string,
  eventId: string,
  userId: string,
): string {
  return `${issuerId}.event-${eventId}-user-${userId}`;
}

function buildClassBody(
  issuerId: string,
  participant: GoogleWalletParticipant,
) {
  const { eventId, eventName, location, startsAt, endsAt } = participant;
  return {
    id: eventTicketClassId(issuerId, eventId),
    issuerName: 'MRUHacks',
    eventName: localizedString(eventName),
    reviewStatus: 'underReview',
    hexBackgroundColor: '#FFFFFF',
    logo: {
      sourceUri: { uri: MRUHACKS_LOGO_URL },
      contentDescription: localizedString('MRUHacks logo'),
    },
    ...(location
      ? {
          venue: {
            name: localizedString(location),
            address: localizedString(location),
          },
        }
      : {}),
    ...(startsAt || endsAt
      ? {
          dateTime: {
            ...(startsAt ? { start: startsAt.toISOString() } : {}),
            ...(endsAt ? { end: endsAt.toISOString() } : {}),
          },
        }
      : {}),
  };
}

/** Creates the event's class if it doesn't exist yet, otherwise updates it to match current event data. */
async function ensureEventTicketClass(
  issuerId: string,
  participant: GoogleWalletParticipant,
): Promise<string> {
  const id = eventTicketClassId(issuerId, participant.eventId);
  const body = buildClassBody(issuerId, participant);
  const existing = await walletApiRequest('eventTicketClass/' + id, {
    method: 'GET',
  });
  if (existing) {
    await walletApiRequest(`eventTicketClass/${id}`, {
      method: 'PATCH',
      body,
    });
  } else {
    await walletApiRequest('eventTicketClass', { method: 'POST', body });
  }
  return id;
}

function buildObjectBody(
  issuerId: string,
  classId: string,
  participant: GoogleWalletParticipant,
) {
  return {
    id: eventTicketObjectId(issuerId, participant.eventId, participant.userId),
    classId,
    state: 'active',
    ticketHolderName: participant.name,
    // ticketHolderName alone isn't rendered on the card face — a text
    // module is what actually shows the participant's name visibly.
    textModulesData: [
      {
        id: 'participant_name',
        header: 'PARTICIPANT',
        body: participant.name,
      },
    ],
    barcode: { type: 'QR_CODE', value: participant.checkInPayload },
  };
}

/** Creates the user's ticket object if it doesn't exist yet, otherwise refreshes it (e.g. a new barcode signature). */
async function ensureEventTicketObject(
  issuerId: string,
  classId: string,
  participant: GoogleWalletParticipant,
): Promise<string> {
  const id = eventTicketObjectId(
    issuerId,
    participant.eventId,
    participant.userId,
  );
  const body = buildObjectBody(issuerId, classId, participant);
  const existing = await walletApiRequest('eventTicketObject/' + id, {
    method: 'GET',
  });
  if (existing) {
    await walletApiRequest(`eventTicketObject/${id}`, {
      method: 'PATCH',
      body,
    });
  } else {
    await walletApiRequest('eventTicketObject', { method: 'POST', body });
  }
  return id;
}

/**
 * Ensures the Google Wallet class/object for this participant exist and are
 * current, then returns the "Save to Google Wallet" URL to redirect them to.
 */
export async function buildGoogleWalletSaveUrl(
  participant: GoogleWalletParticipant,
): Promise<string> {
  const config = getGoogleWalletConfig();

  const classId = await ensureEventTicketClass(config.issuerId, participant);
  const objectId = await ensureEventTicketObject(
    config.issuerId,
    classId,
    participant,
  );

  const claims = {
    iss: config.serviceAccountEmail,
    aud: 'google',
    typ: 'savetowallet',
    origins: [getSiteUrl()],
    payload: {
      eventTicketObjects: [{ id: objectId, classId }],
    },
  };

  const token = jwt.sign(claims, config.privateKey, { algorithm: 'RS256' });
  return `https://pay.google.com/gp/v/save/${token}`;
}
