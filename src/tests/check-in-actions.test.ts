/**
 * Tests for src/app/dashboard/admin/events/check-in-actions.ts
 *
 * Covers the RBAC gate on every exported action, plus check-in behaviour:
 * a pass checks someone in exactly once, and a repeat scan reports the
 * original check-in rather than succeeding again.
 */
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import {
  checkIns,
  eventParticipants,
  events,
  permission,
  user,
  userPermission,
} from '@/db/schema';
import {
  insertAttendees,
  insertParticipant,
} from '@/tests/participation-fixtures';
import { db } from '@/utils/db';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
// The check-in actions invalidate the event dashboard's cached counts;
// `updateTag` throws outside a Server Action request scope.
vi.mock('next/cache', () => ({ updateTag: vi.fn() }));

import { getUser } from '@/utils/auth';
import { buildCheckInPayload } from '@/lib/wallet/check-in-token';
import {
  checkInParticipant,
  getCheckInRoster,
  getCheckInUpdates,
  scanCheckIn,
  undoCheckIn,
} from '@/app/dashboard/admin/events/check-in-actions';

const FORBIDDEN =
  'REDIRECT:/forbidden?reason=missing_permission&permission=checkin:write:all';

const SCANNER_NAME = 'Door Volunteer';
const PARTICIPANT_NAME = 'Check-in Participant';

type MockUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

let scanner: MockUser;
let noPermUser: MockUser;
let participantId: string;
let strangerId: string;
let eventId: string;
let otherEventId: string;
let childEventId: string;
/** A sub-event of `eventId` whose own slot has already finished. */
let pastChildEventId: string;
/** A sub-event of `otherEventId` — a valid sub-event of the wrong parent. */
let foreignChildEventId: string;
let expiredEventId: string;
let permissionId: number;

const originalKey = process.env.CHECK_IN_SIGNING_PRIVATE_KEY;

async function createUser(name: string, email: string): Promise<string> {
  const [row] = await db
    .insert(user)
    .values({ name, email, emailVerified: true })
    .returning({ id: user.id });
  return row.id;
}

async function createEvent(
  name: string,
  parentEventId?: string,
  endsAt?: Date,
): Promise<string> {
  const [row] = await db
    .insert(events)
    .values({
      name,
      hasApplication: false,
      applicationQuestions: [],
      ...(parentEventId ? { parentEventId } : {}),
      ...(endsAt ? { endsAt } : {}),
    })
    .returning({ id: events.id });
  return row.id;
}

/** What the scanner reports after reading a pass — the wallet passes and the
 *  in-app QR all encode the same base64url token text (see check-in-token.ts). */
function passFor(targetEventId: string, targetUserId: string): string {
  return buildCheckInPayload(targetEventId, targetUserId);
}

beforeAll(async () => {
  const { privateKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  process.env.CHECK_IN_SIGNING_PRIVATE_KEY = privateKey as unknown as string;

  const scannerId = await createUser(SCANNER_NAME, 'check-in-scanner@test.dev');
  scanner = {
    id: scannerId,
    email: 'check-in-scanner@test.dev',
    name: SCANNER_NAME,
    emailVerified: true,
  };

  const noPermId = await createUser('No Perm', 'check-in-noperm@test.dev');
  noPermUser = {
    id: noPermId,
    email: 'check-in-noperm@test.dev',
    name: 'No Perm',
    emailVerified: true,
  };

  participantId = await createUser(
    PARTICIPANT_NAME,
    'check-in-participant@test.dev',
  );
  strangerId = await createUser('Stranger', 'check-in-stranger@test.dev');

  eventId = await createEvent('Check-in Test Event');
  otherEventId = await createEvent('Check-in Other Event');
  childEventId = await createEvent('Check-in Lunch', eventId);
  pastChildEventId = await createEvent(
    'Check-in Breakfast',
    eventId,
    new Date(Date.now() - 60_000),
  );
  foreignChildEventId = await createEvent('Check-in Other Lunch', otherEventId);
  expiredEventId = await createEvent(
    'Check-in Ended Event',
    undefined,
    new Date(Date.now() - 60_000),
  );

  await insertAttendees([
    { eventId, userId: participantId },
    { eventId: otherEventId, userId: participantId },
    { eventId: childEventId, userId: participantId },
    { eventId: expiredEventId, userId: participantId },
  ]);

  const [created] = await db
    .insert(permission)
    .values({ slug: 'checkin:write:all' })
    .onConflictDoNothing()
    .returning({ id: permission.id });
  if (created) {
    permissionId = created.id;
  } else {
    const [existing] = await db
      .select({ id: permission.id })
      .from(permission)
      .where(eq(permission.slug, 'checkin:write:all'))
      .limit(1);
    permissionId = existing!.id;
  }
  await db
    .insert(userPermission)
    .values({ userId: scannerId, permissionId })
    .onConflictDoNothing();

  vi.mocked(getUser).mockResolvedValue(scanner as never);
});

afterAll(async () => {
  await db.delete(checkIns).where(eq(checkIns.eventId, eventId));
  await db.delete(checkIns).where(eq(checkIns.eventId, expiredEventId));
  await db
    .delete(eventParticipants)
    .where(eq(eventParticipants.eventId, eventId));
  await db
    .delete(eventParticipants)
    .where(eq(eventParticipants.eventId, otherEventId));
  await db
    .delete(eventParticipants)
    .where(eq(eventParticipants.eventId, childEventId));
  await db
    .delete(eventParticipants)
    .where(eq(eventParticipants.eventId, expiredEventId));
  await db.delete(events).where(eq(events.id, childEventId));
  await db.delete(events).where(eq(events.id, pastChildEventId));
  await db.delete(events).where(eq(events.id, foreignChildEventId));
  await db.delete(events).where(eq(events.id, otherEventId));
  await db.delete(events).where(eq(events.id, expiredEventId));
  await db.delete(events).where(eq(events.id, eventId));
  await db.delete(userPermission).where(eq(userPermission.userId, scanner.id));
  await db.delete(permission).where(eq(permission.id, permissionId));
  for (const id of [scanner.id, noPermUser.id, participantId, strangerId]) {
    await db.delete(user).where(eq(user.id, id));
  }

  if (originalKey === undefined) {
    delete process.env.CHECK_IN_SIGNING_PRIVATE_KEY;
  } else {
    process.env.CHECK_IN_SIGNING_PRIVATE_KEY = originalKey;
  }
});

async function clearCheckIns() {
  await db.delete(checkIns).where(eq(checkIns.eventId, eventId));
}

// ─── Authorization ─────────────────────────────────────────────────────────────

describe('authorization', () => {
  test('every action fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    try {
      const pass = passFor(eventId, participantId);
      await expect(scanCheckIn(eventId, pass)).resolves.toMatchObject({
        success: false,
      });
      await expect(
        checkInParticipant(eventId, participantId),
      ).resolves.toMatchObject({ success: false });
      await expect(undoCheckIn(eventId, participantId)).resolves.toMatchObject({
        success: false,
      });
      await expect(getCheckInRoster(eventId)).resolves.toMatchObject({
        success: false,
      });
      await expect(getCheckInUpdates(eventId, null)).resolves.toMatchObject({
        success: false,
      });
    } finally {
      vi.mocked(getUser).mockResolvedValue(scanner as never);
    }
  });

  test('every action redirects to /forbidden without checkin:write:all', async () => {
    vi.mocked(getUser).mockResolvedValue(noPermUser as never);
    try {
      const pass = passFor(eventId, participantId);
      await expect(scanCheckIn(eventId, pass)).rejects.toThrow(FORBIDDEN);
      await expect(checkInParticipant(eventId, participantId)).rejects.toThrow(
        FORBIDDEN,
      );
      await expect(undoCheckIn(eventId, participantId)).rejects.toThrow(
        FORBIDDEN,
      );
      await expect(getCheckInRoster(eventId)).rejects.toThrow(FORBIDDEN);
      await expect(getCheckInUpdates(eventId, null)).rejects.toThrow(FORBIDDEN);
    } finally {
      vi.mocked(getUser).mockResolvedValue(scanner as never);
    }
  });
});

// ─── Scanning ──────────────────────────────────────────────────────────────────

describe('scanCheckIn', () => {
  test('checks a participant in on the first scan', async () => {
    await clearCheckIns();
    const result = await scanCheckIn(eventId, passFor(eventId, participantId));

    expect(result).toMatchObject({ success: true });
    expect(result.success && result.data).toMatchObject({
      userId: participantId,
      name: PARTICIPANT_NAME,
      alreadyCheckedIn: false,
    });
  });

  test('records who scanned the pass', async () => {
    await clearCheckIns();
    await scanCheckIn(eventId, passFor(eventId, participantId));

    const [row] = await db
      .select({ checkedInBy: checkIns.checkedInBy })
      .from(checkIns)
      .where(
        and(eq(checkIns.eventId, eventId), eq(checkIns.userId, participantId)),
      )
      .limit(1);
    expect(row?.checkedInBy).toBe(scanner.id);
  });

  test('reports the original check-in when the same pass is scanned again', async () => {
    await clearCheckIns();
    const pass = passFor(eventId, participantId);

    const first = await scanCheckIn(eventId, pass);
    const second = await scanCheckIn(eventId, pass);

    expect(first.success && first.data?.alreadyCheckedIn).toBe(false);
    expect(second.success && second.data).toMatchObject({
      alreadyCheckedIn: true,
      checkedInByName: SCANNER_NAME,
    });
    expect(
      Date.parse(second.success ? (second.data?.checkedInAt ?? '') : ''),
    ).toBe(Date.parse(first.success ? (first.data?.checkedInAt ?? '') : ''));
  });

  test('leaves exactly one row behind after repeated scans', async () => {
    await clearCheckIns();
    const pass = passFor(eventId, participantId);
    await Promise.all([
      scanCheckIn(eventId, pass),
      scanCheckIn(eventId, pass),
      scanCheckIn(eventId, pass),
    ]);

    const rows = await db
      .select({ userId: checkIns.userId })
      .from(checkIns)
      .where(
        and(eq(checkIns.eventId, eventId), eq(checkIns.userId, participantId)),
      );
    expect(rows).toHaveLength(1);
  });

  test('rejects a pass issued for a different event', async () => {
    await clearCheckIns();
    const result = await scanCheckIn(
      eventId,
      passFor(otherEventId, participantId),
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('different event'),
    });
  });

  test('rejects a scan for an event that has already ended', async () => {
    const result = await scanCheckIn(
      expiredEventId,
      passFor(expiredEventId, participantId),
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('ended'),
    });
  });

  test('rejects a payload that is not a signed pass', async () => {
    const result = await scanCheckIn(eventId, 'not-a-pass');
    expect(result).toMatchObject({ success: false });
  });

  test('rejects a tampered pass', async () => {
    const bytes = Buffer.from(passFor(eventId, participantId), 'base64url');
    bytes[20] ^= 0xff;
    const result = await scanCheckIn(eventId, bytes.toString('base64url'));
    expect(result).toMatchObject({ success: false });
  });

  test('rejects someone who is not registered for the event', async () => {
    const result = await scanCheckIn(eventId, passFor(eventId, strangerId));
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('not registered'),
    });
  });

  // Holding a spot is `accepted`, and nothing else: an applicant who never
  // answered their RSVP, declined it, or let it expire holds no spot.
  test.each(['invited', 'declined', 'timed_out', 'waitlisted'] as const)(
    'rejects a %s participant, who holds no spot',
    async (status) => {
      const userId = await createUser(
        `Not attending ${status}`,
        `check-in-${status}@test.dev`,
      );
      await insertParticipant({ eventId, userId, status });
      try {
        const scan = await scanCheckIn(eventId, passFor(eventId, userId));
        expect(scan).toMatchObject({
          success: false,
          error: expect.stringContaining('not registered'),
        });
        const roster = await getCheckInRoster(eventId);
        const ids = roster.success
          ? (roster.data ?? []).map((row) => row.userId)
          : [];
        expect(ids).not.toContain(userId);
      } finally {
        await db.delete(user).where(eq(user.id, userId));
      }
    },
  );

  test('refuses a sub-event, which issues no passes of its own', async () => {
    const result = await scanCheckIn(
      childEventId,
      passFor(childEventId, participantId),
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('main events'),
    });
  });
});

// ─── Manual check-in and undo ──────────────────────────────────────────────────

describe('checkInParticipant and undoCheckIn', () => {
  test('checks someone in by hand', async () => {
    await clearCheckIns();
    const result = await checkInParticipant(eventId, participantId);
    expect(result.success && result.data).toMatchObject({
      alreadyCheckedIn: false,
      name: PARTICIPANT_NAME,
    });
  });

  test('undo removes the check-in and lets the pass work again', async () => {
    await clearCheckIns();
    await scanCheckIn(eventId, passFor(eventId, participantId));

    await expect(undoCheckIn(eventId, participantId)).resolves.toMatchObject({
      success: true,
    });

    const rescan = await scanCheckIn(eventId, passFor(eventId, participantId));
    expect(rescan.success && rescan.data?.alreadyCheckedIn).toBe(false);
  });

  test('undo fails when they were never checked in', async () => {
    await clearCheckIns();
    await expect(undoCheckIn(eventId, participantId)).resolves.toMatchObject({
      success: false,
    });
  });

  test('rejects a malformed participant id', async () => {
    await expect(checkInParticipant(eventId, 'nope')).resolves.toMatchObject({
      success: false,
    });
  });

  test('rejects a hand check-in after the event has ended, same as a scan', async () => {
    await db.delete(checkIns).where(eq(checkIns.eventId, expiredEventId));
    const result = await checkInParticipant(expiredEventId, participantId);
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('ended'),
    });
  });

  test('rejects undoing a check-in after the event has ended', async () => {
    await db
      .insert(checkIns)
      .values({ eventId: expiredEventId, userId: participantId })
      .onConflictDoNothing();
    const result = await undoCheckIn(expiredEventId, participantId);
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('ended'),
    });
    await db.delete(checkIns).where(eq(checkIns.eventId, expiredEventId));
  });
});

// ─── Roster ────────────────────────────────────────────────────────────────────

describe('getCheckInRoster', () => {
  test('lists registered participants and omits everyone else', async () => {
    await clearCheckIns();
    const result = await getCheckInRoster(eventId);
    expect(result.success).toBe(true);

    const rows = result.success ? (result.data ?? []) : [];
    expect(rows.map((row) => row.userId)).toContain(participantId);
    expect(rows.map((row) => row.userId)).not.toContain(strangerId);
    expect(rows.find((row) => row.userId === participantId)).toMatchObject({
      checkedInAt: null,
      name: PARTICIPANT_NAME,
    });
  });

  test('surfaces check-in time and who recorded it', async () => {
    await clearCheckIns();
    await scanCheckIn(eventId, passFor(eventId, participantId));

    const result = await getCheckInRoster(eventId);
    const row = result.success
      ? result.data?.find((entry) => entry.userId === participantId)
      : undefined;

    expect(row?.checkedInAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(row?.checkedInAtLabel).toMatch(/[AP]M MT/);
    expect(row?.checkedInByName).toBe(SCANNER_NAME);
  });

  test('refuses a sub-event', async () => {
    await expect(getCheckInRoster(childEventId)).resolves.toMatchObject({
      success: false,
    });
  });
});

// ─── Incremental updates ───────────────────────────────────────────────────────

describe('getCheckInUpdates', () => {
  async function updatesSince(since: string | null) {
    const result = await getCheckInUpdates(eventId, since);
    expect(result.success).toBe(true);
    return result.success ? result.data! : null!;
  }

  test('reports every check-in when there is no watermark', async () => {
    await clearCheckIns();
    await scanCheckIn(eventId, passFor(eventId, participantId));

    const updates = await updatesSince(null);
    expect(updates.checkedInCount).toBe(1);
    expect(updates.changed).toHaveLength(1);
    expect(updates.changed[0]).toMatchObject({
      userId: participantId,
      checkedInByName: SCANNER_NAME,
    });
    expect(updates.changed[0].checkedInAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  test('sends nothing new once the watermark is past the last check-in', async () => {
    await clearCheckIns();
    await scanCheckIn(eventId, passFor(eventId, participantId));

    // A second past the newest row, so the millisecond-truncated watermark
    // the page actually sends cannot re-include it.
    const updates = await updatesSince(
      new Date(Date.now() + 1000).toISOString(),
    );
    expect(updates.changed).toHaveLength(0);
    expect(updates.checkedInCount).toBe(1);
  });

  test('keeps counting check-ins an undo removed from the changed set', async () => {
    await clearCheckIns();
    await scanCheckIn(eventId, passFor(eventId, participantId));
    await undoCheckIn(eventId, participantId);

    // Nothing to send and nothing to count — the caller sees its own tally
    // overshoot and knows to reload rather than sit on a phantom check-in.
    const updates = await updatesSince(null);
    expect(updates.changed).toHaveLength(0);
    expect(updates.checkedInCount).toBe(0);
  });

  test('falls back to the full set when the watermark is not an instant', async () => {
    await clearCheckIns();
    await scanCheckIn(eventId, passFor(eventId, participantId));

    const updates = await updatesSince('last tuesday');
    expect(updates.changed).toHaveLength(1);
    expect(updates.checkedInCount).toBe(1);
  });

  test('refuses an id that is not a uuid', async () => {
    await expect(getCheckInUpdates('not-a-uuid', null)).resolves.toMatchObject({
      success: false,
    });
  });
});

// ─── Sub-event check-in ────────────────────────────────────────────────────────

/**
 * A sub-event is a check-in target, never a pass issuer: every scan here still
 * presents the *main* event's pass, and the sub-event arrives as the trailing
 * argument. That's why none of these needs a new token version.
 */
describe('sub-event check-in', () => {
  async function clearAll() {
    for (const id of [eventId, childEventId, pastChildEventId]) {
      await db.delete(checkIns).where(eq(checkIns.eventId, id));
    }
  }

  async function atDoor() {
    const result = await scanCheckIn(eventId, passFor(eventId, participantId));
    expect(result.success).toBe(true);
  }

  test('refuses someone who has not checked in at the main event', async () => {
    await clearAll();

    const result = await scanCheckIn(
      eventId,
      passFor(eventId, participantId),
      childEventId,
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('has not checked in at the main event'),
    });
    // And nothing was written for the sub-event.
    const rows = await db
      .select({ userId: checkIns.userId })
      .from(checkIns)
      .where(eq(checkIns.eventId, childEventId));
    expect(rows).toHaveLength(0);
  });

  test('succeeds once they are at the door, keeping both rows', async () => {
    await clearAll();
    await atDoor();

    const result = await scanCheckIn(
      eventId,
      passFor(eventId, participantId),
      childEventId,
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        userId: participantId,
        alreadyCheckedIn: false,
        // Echoed back so the desk can confirm which target it recorded.
        targetName: 'Check-in Lunch',
      },
    });

    // The door row and the sub-event row are independent: one per event id.
    for (const id of [eventId, childEventId]) {
      const rows = await db
        .select({ userId: checkIns.userId })
        .from(checkIns)
        .where(
          and(eq(checkIns.eventId, id), eq(checkIns.userId, participantId)),
        );
      expect(rows).toHaveLength(1);
    }
  });

  test('reports a repeat sub-event scan as already checked in', async () => {
    await clearAll();
    await atDoor();
    await scanCheckIn(eventId, passFor(eventId, participantId), childEventId);

    const result = await scanCheckIn(
      eventId,
      passFor(eventId, participantId),
      childEventId,
    );

    expect(result).toMatchObject({
      success: true,
      data: { alreadyCheckedIn: true, checkedInByName: SCANNER_NAME },
    });
  });

  test('main-event check-in is unaffected by a sub-event scan', async () => {
    await clearAll();
    await atDoor();
    await scanCheckIn(eventId, passFor(eventId, participantId), childEventId);

    // The door tile counts only the main event's own rows.
    const updates = await getCheckInUpdates(eventId, null);
    expect(updates.success && updates.data?.checkedInCount).toBe(1);
  });

  // The security-critical pair: a target is only ever valid as a child of the
  // event in the first argument.
  test('refuses an unrelated top-level event as a target', async () => {
    await clearAll();
    await atDoor();

    await expect(
      scanCheckIn(eventId, passFor(eventId, participantId), otherEventId),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('does not belong to this event'),
    });
  });

  test("refuses another event's sub-event as a target", async () => {
    await clearAll();
    await atDoor();

    await expect(
      scanCheckIn(
        eventId,
        passFor(eventId, participantId),
        foreignChildEventId,
      ),
    ).resolves.toMatchObject({ success: false });
  });

  test('checkInParticipant honours the same rules', async () => {
    await clearAll();

    await expect(
      checkInParticipant(eventId, participantId, childEventId),
    ).resolves.toMatchObject({ success: false });

    await atDoor();

    await expect(
      checkInParticipant(eventId, participantId, childEventId),
    ).resolves.toMatchObject({
      success: true,
      data: { targetName: 'Check-in Lunch' },
    });
    await expect(
      checkInParticipant(eventId, participantId, foreignChildEventId),
    ).resolves.toMatchObject({ success: false });
  });

  test('undo removes only the targeted sub-event row', async () => {
    await clearAll();
    await atDoor();
    await scanCheckIn(eventId, passFor(eventId, participantId), childEventId);

    await expect(
      undoCheckIn(eventId, participantId, childEventId),
    ).resolves.toMatchObject({ success: true });

    const subeventRows = await db
      .select({ userId: checkIns.userId })
      .from(checkIns)
      .where(eq(checkIns.eventId, childEventId));
    expect(subeventRows).toHaveLength(0);

    // Still at the door — undoing a meal is not a departure.
    const doorRows = await db
      .select({ userId: checkIns.userId })
      .from(checkIns)
      .where(eq(checkIns.eventId, eventId));
    expect(doorRows).toHaveLength(1);
  });

  test('undoing the door check-in leaves sub-event rows alone', async () => {
    await clearAll();
    await atDoor();
    await scanCheckIn(eventId, passFor(eventId, participantId), childEventId);

    await undoCheckIn(eventId, participantId);

    // Cascading would silently destroy attendance data that was correctly
    // recorded; they were at lunch whether or not the door scan stands.
    const subeventRows = await db
      .select({ userId: checkIns.userId })
      .from(checkIns)
      .where(eq(checkIns.eventId, childEventId));
    expect(subeventRows).toHaveLength(1);
  });

  // Freeze is the parent's end, not the sub-event's — a lunch line at 13:05 for
  // a 13:00 lunch is the normal case, and corrections have to stay possible.
  test('allows check-in for a sub-event that has already ended', async () => {
    await clearAll();
    await atDoor();

    await expect(
      scanCheckIn(eventId, passFor(eventId, participantId), pastChildEventId),
    ).resolves.toMatchObject({ success: true });
  });

  test('freezes once the parent event has ended', async () => {
    await expect(
      scanCheckIn(expiredEventId, passFor(expiredEventId, participantId)),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('frozen'),
    });
  });

  test('roster keeps the main population while tracking the sub-event', async () => {
    await clearAll();
    await atDoor();
    await scanCheckIn(eventId, passFor(eventId, participantId), childEventId);

    const result = await getCheckInRoster(eventId, childEventId);
    expect(result.success).toBe(true);
    const rows = result.success ? result.data! : [];

    const row = rows.find((entry) => entry.userId === participantId);
    expect(row).toMatchObject({ atMainEvent: true });
    expect(row?.checkedInAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);

    // Eligibility still comes from the main event, so somebody who never
    // arrived is listed — flagged, not hidden, so the desk can say why.
    const stranger = rows.find((entry) => entry.userId === strangerId);
    expect(stranger).toBeUndefined();
  });

  test('roster flags a registered participant who is not at the door', async () => {
    await clearAll();

    const result = await getCheckInRoster(eventId, childEventId);
    const row = result.success
      ? result.data?.find((entry) => entry.userId === participantId)
      : undefined;

    expect(row).toMatchObject({ atMainEvent: false, checkedInAt: null });
  });

  test('updates are scoped to the target', async () => {
    await clearAll();
    await atDoor();
    await scanCheckIn(eventId, passFor(eventId, participantId), childEventId);

    const subevent = await getCheckInUpdates(eventId, null, childEventId);
    expect(subevent.success && subevent.data?.checkedInCount).toBe(1);

    const past = await getCheckInUpdates(eventId, null, pastChildEventId);
    expect(past.success && past.data?.checkedInCount).toBe(0);
  });

  test('refuses a forged target on the read paths too', async () => {
    await expect(
      getCheckInRoster(eventId, otherEventId),
    ).resolves.toMatchObject({ success: false });
    await expect(
      getCheckInUpdates(eventId, null, otherEventId),
    ).resolves.toMatchObject({ success: false });
  });
});

describe('disabled check-in', () => {
  test.each(['main', 'schedule'] as const)(
    'blocks every scanner action when %s check-in is disabled',
    async (kind) => {
      vi.mocked(getUser).mockResolvedValue(scanner as never);
      const disabledId = kind === 'main' ? eventId : childEventId;
      const targetId = kind === 'main' ? undefined : childEventId;
      await db
        .update(events)
        .set({ checkInEnabled: false })
        .where(eq(events.id, disabledId));
      try {
        for (const action of [
          () => scanCheckIn(eventId, passFor(eventId, participantId), targetId),
          () => checkInParticipant(eventId, participantId, targetId),
          () => undoCheckIn(eventId, participantId, targetId),
          () => getCheckInRoster(eventId, targetId),
          () => getCheckInUpdates(eventId, null, targetId),
        ]) {
          await expect(action()).resolves.toMatchObject({
            success: false,
            error: 'Check-in is disabled for this event.',
          });
        }
      } finally {
        await db
          .update(events)
          .set({ checkInEnabled: true })
          .where(eq(events.id, disabledId));
      }
    },
  );
});
