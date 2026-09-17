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
  eventAttendees,
  events,
  permission,
  user,
  userPermission,
} from '@/db/schema';
import { db } from '@/utils/db';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));

import { getUser } from '@/utils/auth';
import {
  buildCheckInPayload,
  buildCheckInToken,
} from '@/lib/wallet/check-in-token';
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

/** What a scanner sends after reading a wallet pass: base64url of ASCII text. */
function passFor(targetEventId: string, targetUserId: string): string {
  const text = buildCheckInPayload(targetEventId, targetUserId);
  return Buffer.from(text, 'ascii').toString('base64url');
}

/** What a scanner sends after reading the in-app QR: base64url of raw bytes. */
function inAppQrFor(targetEventId: string, targetUserId: string): string {
  return buildCheckInToken(targetEventId, targetUserId).toString('base64url');
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
  expiredEventId = await createEvent(
    'Check-in Ended Event',
    undefined,
    new Date(Date.now() - 60_000),
  );

  await db
    .insert(eventAttendees)
    .values([
      { eventId, userId: participantId },
      { eventId: otherEventId, userId: participantId },
      { eventId: childEventId, userId: participantId },
      { eventId: expiredEventId, userId: participantId },
    ])
    .onConflictDoNothing();

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
  await db.delete(eventAttendees).where(eq(eventAttendees.eventId, eventId));
  await db
    .delete(eventAttendees)
    .where(eq(eventAttendees.eventId, otherEventId));
  await db
    .delete(eventAttendees)
    .where(eq(eventAttendees.eventId, childEventId));
  await db
    .delete(eventAttendees)
    .where(eq(eventAttendees.eventId, expiredEventId));
  await db.delete(events).where(eq(events.id, childEventId));
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

  test('accepts the in-app QR, whose token is raw bytes rather than text', async () => {
    await clearCheckIns();
    const result = await scanCheckIn(
      eventId,
      inAppQrFor(eventId, participantId),
    );

    expect(result).toMatchObject({ success: true });
    expect(result.success && result.data).toMatchObject({
      userId: participantId,
      alreadyCheckedIn: false,
    });
  });

  test('treats the wallet pass and the in-app QR as the same check-in', async () => {
    await clearCheckIns();
    const first = await scanCheckIn(eventId, passFor(eventId, participantId));
    const second = await scanCheckIn(
      eventId,
      inAppQrFor(eventId, participantId),
    );

    expect(first.success && first.data?.alreadyCheckedIn).toBe(false);
    expect(second.success && second.data?.alreadyCheckedIn).toBe(true);
  });

  test('rejects an in-app QR issued for a different event', async () => {
    await clearCheckIns();
    const result = await scanCheckIn(
      eventId,
      inAppQrFor(otherEventId, participantId),
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('different event'),
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
      error: expect.stringContaining('expired'),
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

  test('still allows a hand check-in after the event has ended, unlike a scan', async () => {
    await db
      .delete(checkIns)
      .where(eq(checkIns.eventId, expiredEventId));
    const result = await checkInParticipant(expiredEventId, participantId);
    expect(result.success && result.data).toMatchObject({
      alreadyCheckedIn: false,
    });
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
