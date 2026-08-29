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

import { getUser } from '@/utils/auth';
import { GET as getAsset } from '@/app/api/assets/[...key]/route';
import { GET as getResume } from '@/app/api/profile/resume/route';
import { GET as getHealth } from '@/app/api/health/route';

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
