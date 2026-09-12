/**
 * Auth/authorization tests for the API route handlers under src/app/api that
 * touch the database or gate access on a session — excluded from the
 * coverage report as "thin wrappers" but still worth testing directly since
 * each one makes its own access-control decision:
 *
 *  - /api/assets/[...key]: public for profile pictures, session-gated for
 *    event/wiki attachments, 404 for anything else.
 *  - /api/profile/resume: session-gated, and always scoped to the caller's
 *    own profile row (no user id is ever accepted as input).
 *  - /api/health: unauthenticated/under-permissioned callers get only
 *    {status, buildInfo}; the full per-service report requires
 *    system:read:all or a matching x-health-access-key header.
 *  - /api/wallet/pass/[eventId], /api/wallet/qr/[eventId], and
 *    /api/wallet/google/[eventId]: session-gated, and only issue a
 *    pass/code/save-link to a caller who is an approved applicant or a
 *    registered attendee of that specific (top-level) event — all three
 *    share the same authorization lookup (src/lib/wallet/participation.ts).
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/utils/db';
import {
  user,
  userProfiles,
  genders,
  permission,
  userPermission,
  events,
  eventAttendees,
  eventApplications,
  applicationStatuses,
} from '@/db/schema';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('@/utils/mail', () => ({
  verifyMailConnection: vi.fn().mockResolvedValue(undefined),
}));

const eventAttachmentRedirect = vi.fn();
const profilePictureRedirect = vi.fn();
const resumeRedirect = vi.fn();
const checkObjectStorageConnection = vi.fn().mockResolvedValue(undefined);

vi.mock('@/utils/object-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/object-storage')>()),
  eventAttachmentRedirect: (key: string) => eventAttachmentRedirect(key),
  profilePictureRedirect: (key: string) => profilePictureRedirect(key),
  resumeRedirect: (key: string, fileName: string) =>
    resumeRedirect(key, fileName),
  checkObjectStorageConnection: () => checkObjectStorageConnection(),
}));

// Pass signing needs real Apple certs (not present in CI), and pass *content*
// is covered separately in wallet-pass.test.ts — here we only care whether
// the route decides to call this at all.
const generateParticipantPass = vi.fn();
vi.mock('@/lib/wallet/generate-pass', () => ({
  generateParticipantPass: (...args: unknown[]) =>
    generateParticipantPass(...args),
}));

// Check-in signing needs a real secret (not present in CI); same reasoning
// as generateParticipantPass above.
const buildCheckInPayload = vi.fn();
const buildCheckInToken = vi.fn();
vi.mock('@/lib/wallet/check-in-token', () => ({
  buildCheckInPayload: (...args: unknown[]) => buildCheckInPayload(...args),
  buildCheckInToken: (...args: unknown[]) => buildCheckInToken(...args),
  DEFAULT_QR_TTL_MS: 24 * 60 * 60 * 1000,
}));

// Needs real Google Wallet Issuer credentials (not present in CI).
const buildGoogleWalletSaveUrl = vi.fn();
vi.mock('@/lib/wallet/google/event-ticket', () => ({
  buildGoogleWalletSaveUrl: (...args: unknown[]) =>
    buildGoogleWalletSaveUrl(...args),
}));

import { getUser } from '@/utils/auth';
import { GET as getAsset } from '@/app/api/assets/[...key]/route';
import { GET as getResume } from '@/app/api/profile/resume/route';
import { GET as getHealth } from '@/app/api/health/route';
import { GET as getWalletPass } from '@/app/api/wallet/pass/[eventId]/route';
import { GET as getWalletQr } from '@/app/api/wallet/qr/[eventId]/route';
import { GET as getWalletGoogle } from '@/app/api/wallet/google/[eventId]/route';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const ATTACHMENT_KEY = `event-content/${NIL_UUID}/${NIL_UUID}.png`;

// ─── /api/assets/[...key] ───────────────────────────────────────────────────

describe('/api/assets/[...key] GET', () => {
  beforeEach(() => {
    vi.mocked(getUser).mockReset();
    eventAttachmentRedirect.mockReset();
    profilePictureRedirect.mockReset();
  });

  test('serves profile pictures without a session', async () => {
    profilePictureRedirect.mockResolvedValue(
      new Response(null, { status: 302 }),
    );
    const res = await getAsset(new Request('http://x'), {
      params: Promise.resolve({ key: ['profile-pictures', 'abc.png'] }),
    });
    expect(res.status).toBe(302);
    expect(profilePictureRedirect).toHaveBeenCalledWith(
      'profile-pictures/abc.png',
    );
    expect(getUser).not.toHaveBeenCalled();
  });

  test('rejects an event attachment key when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    const res = await getAsset(new Request('http://x'), {
      params: Promise.resolve({ key: ATTACHMENT_KEY.split('/') }),
    });
    expect(res.status).toBe(404);
    expect(eventAttachmentRedirect).not.toHaveBeenCalled();
  });

  test('serves an event attachment key when authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1' } as never);
    eventAttachmentRedirect.mockResolvedValue(
      new Response(null, { status: 302 }),
    );
    const res = await getAsset(new Request('http://x'), {
      params: Promise.resolve({ key: ATTACHMENT_KEY.split('/') }),
    });
    expect(res.status).toBe(302);
    expect(eventAttachmentRedirect).toHaveBeenCalledWith(ATTACHMENT_KEY);
  });

  test('rejects a key that is neither a profile picture nor an event attachment, authenticated or not', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1' } as never);
    const res = await getAsset(new Request('http://x'), {
      params: Promise.resolve({ key: ['resumes', 'abc.pdf'] }),
    });
    expect(res.status).toBe(404);
    expect(eventAttachmentRedirect).not.toHaveBeenCalled();
    expect(profilePictureRedirect).not.toHaveBeenCalled();
  });
});

// ─── /api/profile/resume ────────────────────────────────────────────────────

describe('/api/profile/resume GET', () => {
  let ownerId: string;
  let otherId: string;
  let genderId: number;

  beforeAll(async () => {
    const [g] = await db
      .insert(genders)
      .values({ label: 'resume-route-test-gender' })
      .onConflictDoNothing()
      .returning({ id: genders.id });
    genderId =
      g?.id ??
      (
        await db
          .select({ id: genders.id })
          .from(genders)
          .where(eq(genders.label, 'resume-route-test-gender'))
          .limit(1)
      )[0].id;

    const [owner] = await db
      .insert(user)
      .values({
        name: 'Resume Owner',
        email: 'resume-route-owner@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    const [other] = await db
      .insert(user)
      .values({
        name: 'Resume Other',
        email: 'resume-route-other@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    ownerId = owner.id;
    otherId = other.id;

    // `other` deliberately gets no userProfiles row at all.
    await db.insert(userProfiles).values({
      userId: ownerId,
      fullName: 'Resume Owner',
      genderId,
      resumeFile: 'resumes/resume-route-test.pdf',
      resumeFileName: 'my-resume.pdf',
    });
  });

  afterAll(async () => {
    await db.delete(userProfiles).where(eq(userProfiles.userId, ownerId));
    await db.delete(user).where(eq(user.id, ownerId));
    await db.delete(user).where(eq(user.id, otherId));
  });

  beforeEach(() => {
    vi.mocked(getUser).mockReset();
    resumeRedirect.mockReset();
  });

  test('rejects an unauthenticated request', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    const res = await getResume();
    expect(res.status).toBe(401);
    expect(resumeRedirect).not.toHaveBeenCalled();
  });

  test('returns 404 for an authenticated user with no resume on file', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: otherId } as never);
    const res = await getResume();
    expect(res.status).toBe(404);
    expect(resumeRedirect).not.toHaveBeenCalled();
  });

  // The route takes no target-user parameter — it is always scoped to the
  // caller's own row — so this also proves `other` can never read `owner`'s
  // resume through this endpoint.
  test("serves only the caller's own resume", async () => {
    vi.mocked(getUser).mockResolvedValue({ id: ownerId } as never);
    resumeRedirect.mockResolvedValue(new Response(null, { status: 302 }));
    const res = await getResume();
    expect(res.status).toBe(302);
    expect(resumeRedirect).toHaveBeenCalledWith(
      'resumes/resume-route-test.pdf',
      'my-resume.pdf',
    );
  });
});

// ─── /api/health ─────────────────────────────────────────────────────────────

describe('/api/health GET', () => {
  let noPermUserId: string;
  let permUserId: string;
  let originalTurnstileSecret: string | undefined;
  let originalAccessKey: string | undefined;

  beforeAll(async () => {
    originalTurnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    originalAccessKey = process.env.HEALTH_CHECK_ACCESS_KEY;
    // Unset so checkTurnstile short-circuits to "not configured" instead of
    // making a real network call to Cloudflare.
    delete process.env.TURNSTILE_SECRET_KEY;
    process.env.HEALTH_CHECK_ACCESS_KEY = 'health-route-test-key';

    const [noPerm] = await db
      .insert(user)
      .values({
        name: 'Health No Perm',
        email: 'health-route-noperm@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    const [withPerm] = await db
      .insert(user)
      .values({
        name: 'Health Perm',
        email: 'health-route-perm@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    noPermUserId = noPerm.id;
    permUserId = withPerm.id;

    const [perm] = await db
      .insert(permission)
      .values({ slug: 'system:read:all' })
      .onConflictDoNothing()
      .returning({ id: permission.id });
    const permId =
      perm?.id ??
      (
        await db
          .select({ id: permission.id })
          .from(permission)
          .where(eq(permission.slug, 'system:read:all'))
          .limit(1)
      )[0].id;
    await db
      .insert(userPermission)
      .values({ userId: permUserId, permissionId: permId })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db
      .delete(userPermission)
      .where(eq(userPermission.userId, permUserId));
    await db.delete(user).where(eq(user.id, noPermUserId));
    await db.delete(user).where(eq(user.id, permUserId));

    if (originalTurnstileSecret === undefined)
      delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = originalTurnstileSecret;
    if (originalAccessKey === undefined)
      delete process.env.HEALTH_CHECK_ACCESS_KEY;
    else process.env.HEALTH_CHECK_ACCESS_KEY = originalAccessKey;
  });

  beforeEach(() => {
    vi.mocked(getUser).mockReset();
  });

  test('unauthenticated, no access key: only status and build info', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    const res = await getHealth(new Request('http://x/api/health'));
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['buildInfo', 'status']);
  });

  test('an incorrect access key does not unlock the full report', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    const res = await getHealth(
      new Request('http://x/api/health', {
        headers: { 'x-health-access-key': 'wrong-key' },
      }),
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['buildInfo', 'status']);
  });

  test('authenticated without system:read:all: only status and build info', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: noPermUserId } as never);
    const res = await getHealth(new Request('http://x/api/health'));
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['buildInfo', 'status']);
  });

  test('the correct access key unlocks the full report without a session', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    const res = await getHealth(
      new Request('http://x/api/health', {
        headers: { 'x-health-access-key': 'health-route-test-key' },
      }),
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('checks');
    expect(body).toHaveProperty('missingEnv');
  });

  test('a caller with system:read:all gets the full report', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: permUserId } as never);
    const res = await getHealth(new Request('http://x/api/health'));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('checks');
    expect(body).toHaveProperty('missingEnv');
  });
});

// ─── /api/wallet/pass/[eventId] ─────────────────────────────────────────────

describe('/api/wallet/pass/[eventId] GET', () => {
  let openEventId: string;
  let appEventId: string;
  let childEventId: string;
  let registeredUserId: string;
  let unregisteredUserId: string;
  let approvedUserId: string;
  let pendingUserId: string;
  let approvedStatusId: number;
  let pendingStatusId: number;

  async function statusIdFor(label: string) {
    const [existing] = await db
      .select({ id: applicationStatuses.id })
      .from(applicationStatuses)
      .where(eq(applicationStatuses.label, label))
      .limit(1);
    if (existing) return existing.id;
    const [inserted] = await db
      .insert(applicationStatuses)
      .values({
        label,
        title: label,
        description: label,
        variant: 'default',
        isFinal: label !== 'pending_review',
      })
      .returning({ id: applicationStatuses.id });
    return inserted.id;
  }

  function callRoute(eventId: string) {
    return getWalletPass(new Request('http://x'), {
      params: Promise.resolve({ eventId }),
    });
  }

  beforeAll(async () => {
    const [open] = await db
      .insert(events)
      .values({ name: 'Wallet Open Event', hasApplication: false })
      .returning({ id: events.id });
    openEventId = open.id;

    const [child] = await db
      .insert(events)
      .values({
        name: 'Wallet Open Event Sub-event',
        hasApplication: false,
        parentEventId: openEventId,
      })
      .returning({ id: events.id });
    childEventId = child.id;

    const [app] = await db
      .insert(events)
      .values({
        name: 'Wallet Application Event',
        hasApplication: true,
        applicationQuestions: [],
      })
      .returning({ id: events.id });
    appEventId = app.id;

    approvedStatusId = await statusIdFor('approved');
    pendingStatusId = await statusIdFor('pending_review');

    const [registered, unregistered, approved, pending] = await db
      .insert(user)
      .values([
        {
          name: 'Wallet Registered',
          email: 'wallet-registered@example.com',
          emailVerified: true,
        },
        {
          name: 'Wallet Unregistered',
          email: 'wallet-unregistered@example.com',
          emailVerified: true,
        },
        {
          name: 'Wallet Approved',
          email: 'wallet-approved@example.com',
          emailVerified: true,
        },
        {
          name: 'Wallet Pending',
          email: 'wallet-pending@example.com',
          emailVerified: true,
        },
      ])
      .returning({ id: user.id });
    registeredUserId = registered.id;
    unregisteredUserId = unregistered.id;
    approvedUserId = approved.id;
    pendingUserId = pending.id;

    await db
      .insert(eventAttendees)
      .values({ eventId: openEventId, userId: registeredUserId });
    await db.insert(eventApplications).values([
      {
        eventId: appEventId,
        userId: approvedUserId,
        statusId: approvedStatusId,
        responses: {},
      },
      {
        eventId: appEventId,
        userId: pendingUserId,
        statusId: pendingStatusId,
        responses: {},
      },
    ]);
  });

  afterAll(async () => {
    await db
      .delete(eventAttendees)
      .where(eq(eventAttendees.eventId, openEventId));
    await db
      .delete(eventApplications)
      .where(eq(eventApplications.eventId, appEventId));
    await db.delete(events).where(eq(events.id, childEventId));
    await db.delete(events).where(eq(events.id, openEventId));
    await db.delete(events).where(eq(events.id, appEventId));
    for (const id of [
      registeredUserId,
      unregisteredUserId,
      approvedUserId,
      pendingUserId,
    ]) {
      await db.delete(user).where(eq(user.id, id));
    }
  });

  beforeEach(() => {
    vi.mocked(getUser).mockReset();
    generateParticipantPass.mockReset();
    generateParticipantPass.mockResolvedValue(Buffer.from('fake pkpass'));
  });

  test('rejects an unauthenticated request', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    const res = await callRoute(openEventId);
    expect(res.status).toBe(401);
    expect(generateParticipantPass).not.toHaveBeenCalled();
  });

  test('rejects a non-UUID eventId', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: registeredUserId } as never);
    const res = await callRoute('not-a-uuid');
    expect(res.status).toBe(404);
    expect(generateParticipantPass).not.toHaveBeenCalled();
  });

  test('rejects a nonexistent event', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: registeredUserId } as never);
    const res = await callRoute('00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(generateParticipantPass).not.toHaveBeenCalled();
  });

  test('rejects a sub-event (only top-level events issue passes)', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: registeredUserId } as never);
    const res = await callRoute(childEventId);
    expect(res.status).toBe(404);
    expect(generateParticipantPass).not.toHaveBeenCalled();
  });

  test('rejects a caller who never registered or applied', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: unregisteredUserId } as never);
    const res = await callRoute(openEventId);
    expect(res.status).toBe(404);
    expect(generateParticipantPass).not.toHaveBeenCalled();
  });

  test('rejects a caller with only a pending (not approved) application', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: pendingUserId } as never);
    const res = await callRoute(appEventId);
    expect(res.status).toBe(404);
    expect(generateParticipantPass).not.toHaveBeenCalled();
  });

  test('rejects a registered attendee of one event requesting a different event', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: registeredUserId } as never);
    const res = await callRoute(appEventId);
    expect(res.status).toBe(404);
    expect(generateParticipantPass).not.toHaveBeenCalled();
  });

  test('issues a pass to a registered attendee', async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: registeredUserId,
      name: 'Wallet Registered',
    } as never);
    const res = await callRoute(openEventId);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(
      'application/vnd.apple.pkpass',
    );
    expect(generateParticipantPass).toHaveBeenCalledTimes(1);
    expect(generateParticipantPass).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: openEventId,
        userId: registeredUserId,
      }),
    );
  });

  test('issues a pass to an approved applicant', async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: approvedUserId,
      name: 'Wallet Approved',
    } as never);
    const res = await callRoute(appEventId);
    expect(res.status).toBe(200);
    expect(generateParticipantPass).toHaveBeenCalledTimes(1);
  });
});

// ─── /api/wallet/qr/[eventId] ───────────────────────────────────────────────

describe('/api/wallet/qr/[eventId] GET', () => {
  let openEventId: string;
  let registeredUserId: string;
  let unregisteredUserId: string;

  function callRoute(eventId: string) {
    return getWalletQr(new Request('http://x'), {
      params: Promise.resolve({ eventId }),
    });
  }

  beforeAll(async () => {
    const [open] = await db
      .insert(events)
      .values({ name: 'Wallet QR Open Event', hasApplication: false })
      .returning({ id: events.id });
    openEventId = open.id;

    const [registered, unregistered] = await db
      .insert(user)
      .values([
        {
          name: 'Wallet QR Registered',
          email: 'wallet-qr-registered@example.com',
          emailVerified: true,
        },
        {
          name: 'Wallet QR Unregistered',
          email: 'wallet-qr-unregistered@example.com',
          emailVerified: true,
        },
      ])
      .returning({ id: user.id });
    registeredUserId = registered.id;
    unregisteredUserId = unregistered.id;

    await db
      .insert(eventAttendees)
      .values({ eventId: openEventId, userId: registeredUserId });
  });

  afterAll(async () => {
    await db
      .delete(eventAttendees)
      .where(eq(eventAttendees.eventId, openEventId));
    await db.delete(events).where(eq(events.id, openEventId));
    await db.delete(user).where(eq(user.id, registeredUserId));
    await db.delete(user).where(eq(user.id, unregisteredUserId));
  });

  beforeEach(() => {
    vi.mocked(getUser).mockReset();
    buildCheckInToken.mockReset();
    buildCheckInToken.mockReturnValue(Buffer.from('fake-check-in-token'));
  });

  test('rejects an unauthenticated request', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    const res = await callRoute(openEventId);
    expect(res.status).toBe(401);
    expect(buildCheckInToken).not.toHaveBeenCalled();
  });

  test('rejects a caller who never registered', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: unregisteredUserId } as never);
    const res = await callRoute(openEventId);
    expect(res.status).toBe(404);
    expect(buildCheckInToken).not.toHaveBeenCalled();
  });

  test('rejects a nonexistent event', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: registeredUserId } as never);
    const res = await callRoute('00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(buildCheckInToken).not.toHaveBeenCalled();
  });

  test('returns an SVG QR code for a registered attendee, using the same token as the pass', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: registeredUserId } as never);
    const res = await callRoute(openEventId);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(buildCheckInToken).toHaveBeenCalledWith(
      openEventId,
      registeredUserId,
      'Participant',
      expect.any(Date),
    );
    const body = await res.text();
    expect(body).toContain('<svg');
  });
});

// ─── /api/wallet/google/[eventId] ───────────────────────────────────────────

describe('/api/wallet/google/[eventId] GET', () => {
  let openEventId: string;
  let registeredUserId: string;
  let unregisteredUserId: string;

  function callRoute(eventId: string) {
    return getWalletGoogle(new Request('http://x'), {
      params: Promise.resolve({ eventId }),
    });
  }

  beforeAll(async () => {
    const [open] = await db
      .insert(events)
      .values({ name: 'Wallet Google Open Event', hasApplication: false })
      .returning({ id: events.id });
    openEventId = open.id;

    const [registered, unregistered] = await db
      .insert(user)
      .values([
        {
          name: 'Wallet Google Registered',
          email: 'wallet-google-registered@example.com',
          emailVerified: true,
        },
        {
          name: 'Wallet Google Unregistered',
          email: 'wallet-google-unregistered@example.com',
          emailVerified: true,
        },
      ])
      .returning({ id: user.id });
    registeredUserId = registered.id;
    unregisteredUserId = unregistered.id;

    await db
      .insert(eventAttendees)
      .values({ eventId: openEventId, userId: registeredUserId });
  });

  afterAll(async () => {
    await db
      .delete(eventAttendees)
      .where(eq(eventAttendees.eventId, openEventId));
    await db.delete(events).where(eq(events.id, openEventId));
    await db.delete(user).where(eq(user.id, registeredUserId));
    await db.delete(user).where(eq(user.id, unregisteredUserId));
  });

  beforeEach(() => {
    vi.mocked(getUser).mockReset();
    buildGoogleWalletSaveUrl.mockReset();
    buildGoogleWalletSaveUrl.mockResolvedValue(
      'https://pay.google.com/gp/v/save/fake-jwt',
    );
  });

  test('rejects an unauthenticated request', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    const res = await callRoute(openEventId);
    expect(res.status).toBe(401);
    expect(buildGoogleWalletSaveUrl).not.toHaveBeenCalled();
  });

  test('rejects a caller who never registered', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: unregisteredUserId } as never);
    const res = await callRoute(openEventId);
    expect(res.status).toBe(404);
    expect(buildGoogleWalletSaveUrl).not.toHaveBeenCalled();
  });

  test('rejects a nonexistent event', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: registeredUserId } as never);
    const res = await callRoute('00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(buildGoogleWalletSaveUrl).not.toHaveBeenCalled();
  });

  test('redirects a registered attendee to the Google Wallet save link', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: registeredUserId } as never);
    const res = await callRoute(openEventId);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      'https://pay.google.com/gp/v/save/fake-jwt',
    );
    expect(buildGoogleWalletSaveUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: openEventId,
        userId: registeredUserId,
      }),
    );
  });
});
