'use server';

import * as Rbac from '@/lib/rbac/server';
import * as Ticket from '@/lib/ticket/server';
import { fail, type ActionResult } from '@/utils/action-result';
import { getUser } from '@/utils/auth';

// The check-in desk's server actions. Each one authenticates the volunteer
// and hands over to the ticket module, which owns the check-in rules.
// Every action requires checkin:write:all.

async function getScanner() {
  const actor = await getUser();
  if (!actor) return null;
  await Rbac.requirePermission(actor.id, 'checkin:write:all');
  return actor;
}

/**
 * Checks a participant in from their pass QR code. `eventId` is the main
 * event, which is what the pass encodes; `targetEventId` optionally narrows
 * the check-in to one of its sub-events.
 */
export async function scanCheckIn(
  eventId: string,
  payload: string,
  targetEventId?: string | null,
): Promise<ActionResult<Ticket.CheckInOutcome>> {
  const actor = await getScanner();
  if (!actor) return fail('Not authenticated');
  return Ticket.checkIn({ eventId, targetEventId, who: { payload }, actorId: actor.id });
}

/** Checks a participant in by hand, without a scannable pass. */
export async function checkInParticipant(
  eventId: string,
  userId: string,
  targetEventId?: string | null,
): Promise<ActionResult<Ticket.CheckInOutcome>> {
  const actor = await getScanner();
  if (!actor) return fail('Not authenticated');
  return Ticket.checkIn({ eventId, targetEventId, who: { userId }, actorId: actor.id });
}

/** Removes a check-in recorded in error, leaving only the audit log entry. */
export async function undoCheckIn(
  eventId: string,
  userId: string,
  targetEventId?: string | null,
): Promise<ActionResult> {
  const actor = await getScanner();
  if (!actor) return fail('Not authenticated');
  return Ticket.undoCheckIn({ eventId, targetEventId, userId, actorId: actor.id });
}

/** Lists everyone eligible to attend the event, checked in or not. */
export async function getCheckInRoster(
  eventId: string,
  targetEventId?: string | null,
): Promise<ActionResult<Ticket.CheckInRosterRow[]>> {
  const actor = await getScanner();
  if (!actor) return fail('Not authenticated');
  return Ticket.roster(eventId, targetEventId);
}

/** Reports check-ins recorded since `since`, so the desk can patch its roster. */
export async function getCheckInUpdates(
  eventId: string,
  since: string | null,
  targetEventId?: string | null,
): Promise<ActionResult<Ticket.CheckInUpdates>> {
  const actor = await getScanner();
  if (!actor) return fail('Not authenticated');
  return Ticket.updates(eventId, since, targetEventId);
}
