import 'dotenv/config';
import { randomBytes, randomUUID } from 'crypto';
import { faker } from '@faker-js/faker';
import { auth } from './auth';
import { client, db } from '@/utils/db';
import {
  user,
  account,
  session,
  events,
  userProfiles,
  userInterests,
  userDietaryRestrictions,
  eventApplications,
  eventAttendees,
  genders,
  universities,
  majors,
  yearsOfStudy,
  interests,
  dietaryRestrictions,
  applicationStatuses,
  userRole,
  userPermission,
} from '@/db/schema';
import type { InferInsertModel } from 'drizzle-orm';
import { seedStaticTables } from './seed-static';

const COUNT = Number(process.env.SEED_COUNT ?? 3e2);
const CHUNK_SIZE = Number(process.env.SEED_CHUNK_SIZE ?? 2000);

// ── Stable question UUIDs (deterministic for seed data consistency) ────────
const Q_ATTENDED_BEFORE = '11111111-0000-0000-0000-000000000001';
const Q_ACCOMMODATIONS = '11111111-0000-0000-0000-000000000002';
const Q_NEEDS_PARKING = '11111111-0000-0000-0000-000000000003';
const Q_HEARD_FROM = '11111111-0000-0000-0000-000000000004';
const Q_CONSENT_INFO = '11111111-0000-0000-0000-000000000005';
const Q_CONSENT_SPONSOR = '11111111-0000-0000-0000-000000000006';
const Q_CONSENT_MEDIA = '11111111-0000-0000-0000-000000000007';
const Q_WHY_ATTEND = '11111111-0000-0000-0000-000000000008';
const Q_IDEAS = '11111111-0000-0000-0000-000000000009';
const Q_SPACE_JOURNEY = '11111111-0000-0000-0000-00000000000a';

// ── Stable option UUIDs for heard_from question ───────────────────────────
const OPT_POSTER = '22222222-0000-0000-0000-000000000001';
const OPT_FRIEND = '22222222-0000-0000-0000-000000000002';
const OPT_CLASSROOM = '22222222-0000-0000-0000-000000000003';
const OPT_SOCIAL = '22222222-0000-0000-0000-000000000004';
const OPT_PROFESSOR = '22222222-0000-0000-0000-000000000005';
const OPT_OTHER = '22222222-0000-0000-0000-000000000006';
const HEARD_FROM_OPTIONS = [
  OPT_POSTER,
  OPT_FRIEND,
  OPT_CLASSROOM,
  OPT_SOCIAL,
  OPT_PROFESSOR,
  OPT_OTHER,
];

// ── Types ────────────────────────────────────────────────────────────────
type UserInsert = InferInsertModel<typeof user>;
type AccountInsert = InferInsertModel<typeof account>;
type SessionInsert = InferInsertModel<typeof session>;
type EventInsert = InferInsertModel<typeof events>;
type UserProfileInsert = InferInsertModel<typeof userProfiles>;
type UserInterestInsert = InferInsertModel<typeof userInterests>;
type UserDietaryInsert = InferInsertModel<typeof userDietaryRestrictions>;
type EventApplicationInsert = InferInsertModel<typeof eventApplications>;
type EventAttendeeInsert = InferInsertModel<typeof eventAttendees>;
type UserRoleInsert = InferInsertModel<typeof userRole>;
type UserPermissionInsert = InferInsertModel<typeof userPermission>;

// ── Seed events ───────────────────────────────────────────────────────────
async function seedEvents() {
  const existing = await db.select().from(events).limit(2);
  if (existing.length > 0) {
    const appEvent = existing.find((e) => e.hasApplication) ?? existing[0]!;
    const noAppEvent = existing.find((e) => !e.hasApplication) ?? existing[0]!;
    return { applicationEvent: appEvent, noAppEvent };
  }
  const eventInserts: EventInsert[] = [
    {
      name: 'MRUHacks 2026',
      hasApplication: true,
      capacity: null,
      isFeatured: true,
      applicationQuestions: [
        {
          id: Q_ATTENDED_BEFORE,
          label: 'Have you attended MRUHacks before?',
          type: 'boolean' as const,
          required: true,
          order: 1,
          active: true,
        },
        {
          id: Q_WHY_ATTEND,
          label: 'Why do you want to attend MRUHacks?',
          description:
            'What excites you about the event, and how do you hope it will help you grow? (60 words max)',
          type: 'long_text' as const,
          required: true,
          maxLength: 250,
          order: 2,
          active: true,
        },
        {
          id: Q_IDEAS,
          label:
            'Do you have any ideas you want to make or areas you’d like to learn about during MRUHacks?',
          description: '60 words max',
          type: 'long_text' as const,
          required: true,
          maxLength: 250,
          order: 3,
          active: true,
        },
        {
          id: Q_SPACE_JOURNEY,
          label:
            'If you had to go on a 10-year journey through space all alone, what would you bring to entertain yourself?',
          description: '20 words max',
          type: 'long_text' as const,
          required: true,
          maxLength: 90,
          order: 4,
          active: true,
        },
        {
          id: Q_ACCOMMODATIONS,
          label: 'Accessibility or accommodations',
          description: 'Please let us know if you have any special needs.',
          type: 'long_text' as const,
          required: false,
          order: 5,
          active: true,
        },
        {
          id: Q_NEEDS_PARKING,
          label: 'I require parking',
          type: 'boolean' as const,
          required: false,
          order: 6,
          active: true,
        },
        {
          id: Q_HEARD_FROM,
          label: 'How did you hear about us?',
          type: 'single_select' as const,
          required: true,
          order: 7,
          active: true,
          options: [
            { value: OPT_POSTER, label: 'Poster', active: true },
            { value: OPT_FRIEND, label: 'Friend / Classmate', active: true },
            { value: OPT_CLASSROOM, label: 'Classroom Visit', active: true },
            { value: OPT_SOCIAL, label: 'Social Media', active: true },
            {
              value: OPT_PROFESSOR,
              label: 'Professor / Course Announcement',
              active: true,
            },
            { value: OPT_OTHER, label: 'Other', active: true },
          ],
        },
        {
          id: Q_CONSENT_INFO,
          label: 'I consent to MRUHacks collecting and using my information',
          type: 'boolean' as const,
          required: true,
          order: 8,
          active: true,
        },
        {
          id: Q_CONSENT_SPONSOR,
          label: 'I consent to sharing my information with sponsors',
          type: 'boolean' as const,
          required: true,
          order: 9,
          active: true,
        },
        {
          id: Q_CONSENT_MEDIA,
          label: 'I consent to photos and videos being taken at the event',
          type: 'boolean' as const,
          required: true,
          order: 10,
          active: true,
        },
      ],
    },
    {
      name: 'Intro to React Workshop',
      hasApplication: false,
      capacity: null,
    },
  ];
  const inserted = await db.insert(events).values(eventInserts).returning();
  const applicationEvent = inserted[0]!;
  const noAppEvent = inserted[1]!;
  console.log(`✅ Seeded ${inserted.length} events.`);
  return { applicationEvent, noAppEvent };
}

// ── Seed a fixed admin user from env vars ────────────────────────────────
async function seedEnvAdminUser(
  insertedRoles: { id: number; slug: string | null }[],
) {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD?.trim();
  const name = process.env.SEED_ADMIN_NAME?.trim() ?? 'Admin';

  if (!email || !password) return;

  console.log(`👤 Seeding admin user: ${email}`);

  const adminRole = insertedRoles.find((r) => r.slug === 'admin');
  const ctx = await auth.$context;

  const existing = await ctx.internalAdapter.findUserByEmail(email);
  let userId: string;

  if (existing) {
    await ctx.internalAdapter.updateUser(existing.user.id, {
      name,
      emailVerified: true,
    });
    const hashedPassword = await ctx.password.hash(password);
    await ctx.internalAdapter.updatePassword(existing.user.id, hashedPassword);
    userId = existing.user.id;
    console.log(`♻️  Updated existing user ${email}`);
  } else {
    const result = await auth.api.signUpEmail({
      body: { email, password, name },
    });
    await ctx.internalAdapter.updateUser(result.user.id, {
      emailVerified: true,
    });
    userId = result.user.id;
    console.log(`✅ Created user ${email}`);
  }

  // Sync Better Auth admin plugin role field
  await ctx.internalAdapter.updateUser(userId, { role: 'admin' });

  if (adminRole) {
    await db
      .insert(userRole)
      .values({ userId, roleId: adminRole.id })
      .onConflictDoNothing();
  }

  console.log(`✅ Admin user ready (email: ${email})`);
}

// ── Main user seeding ───────────────────────────────────────────────────
async function main() {
  const { applicationEvent, noAppEvent } = await seedEvents();

  console.log(`🌱 Seeding ${COUNT} fake users in chunks of ${CHUNK_SIZE}...`);

  const { insertedRoles, insertedPerms } = await seedStaticTables();

  const [
    genderRows,
    universityRows,
    majorRows,
    yearRows,
    interestRows,
    dietaryRows,
    applicationStatusRows,
  ] = await Promise.all([
    db.select().from(genders),
    db.select().from(universities),
    db.select().from(majors),
    db.select().from(yearsOfStudy),
    db.select().from(interests),
    db.select().from(dietaryRestrictions),
    db.select().from(applicationStatuses),
  ]);

  const pendingReviewStatus = applicationStatusRows.find(
    (s) => s.label === 'pending_review',
  );
  const pendingReviewStatusId = pendingReviewStatus?.id ?? null;

  const now = new Date();
  const chunkCount = Math.ceil(COUNT / CHUNK_SIZE);

  for (let c = 0; c < chunkCount; c++) {
    const start = c * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, COUNT);
    const size = end - start;

    const users: UserInsert[] = [];
    const accounts: AccountInsert[] = [];
    const sessions: SessionInsert[] = [];
    const profiles: UserProfileInsert[] = [];
    const interestLinks: UserInterestInsert[] = [];
    const dietaryLinks: UserDietaryInsert[] = [];
    const applicationData: EventApplicationInsert[] = [];
    const attendeeData: EventAttendeeInsert[] = [];
    const userRoles: UserRoleInsert[] = [];
    const userPerms: UserPermissionInsert[] = [];

    for (let i = 0; i < size; i++) {
      const id = randomUUID();
      const name = faker.person.fullName();
      const base = faker.internet
        .username({ firstName: name.split(' ')[0] })
        .toLowerCase();
      const email = `${base}.${i + start}@example.com`;

      users.push({
        id,
        name,
        email,
        emailVerified: faker.datatype.boolean(),
        image: faker.image.avatar(),
        createdAt: now,
        updatedAt: now,
      });

      accounts.push({
        id: randomUUID(),
        accountId: randomUUID(),
        providerId: 'credentials',
        userId: id,
        password: randomBytes(24).toString('hex'),
        createdAt: now,
        updatedAt: now,
      });

      sessions.push({
        id: randomUUID(),
        token: randomBytes(24).toString('hex'),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
        ipAddress: faker.internet.ip(),
        userAgent: faker.internet.userAgent(),
        createdAt: now,
        updatedAt: now,
        userId: id,
      });

      const gender = faker.helpers.arrayElement(genderRows);
      const university = faker.helpers.arrayElement(universityRows);
      const major = faker.helpers.arrayElement(majorRows);
      const year = faker.helpers.arrayElement(yearRows);

      profiles.push({
        userId: id,
        fullName: name,
        genderId: gender.id,
        universityId: university.id,
        majorId: major.id,
        yearOfStudyId: year.id,
        createdAt: now,
        updatedAt: now,
      });

      applicationData.push({
        eventId: applicationEvent.id,
        userId: id,
        statusId: pendingReviewStatusId,
        createdAt: now,
        updatedAt: now,
        responses: {
          [Q_ATTENDED_BEFORE]: faker.datatype.boolean(),
          [Q_ACCOMMODATIONS]: faker.helpers.maybe(
            () => faker.lorem.sentence(),
            {
              probability: 0.25,
            },
          ),
          [Q_NEEDS_PARKING]: faker.datatype.boolean(),
          [Q_HEARD_FROM]: faker.helpers.arrayElement(HEARD_FROM_OPTIONS),
          [Q_CONSENT_INFO]: true,
          [Q_CONSENT_SPONSOR]: faker.datatype.boolean({ probability: 0.9 }),
          [Q_CONSENT_MEDIA]: faker.datatype.boolean({ probability: 0.9 }),
        },
      });

      const chosenInterests = faker.helpers.arrayElements(
        interestRows,
        faker.number.int({ min: 1, max: Math.min(4, interestRows.length) }),
      );
      for (const it of chosenInterests)
        interestLinks.push({ userId: id, interestId: it.id });

      const chosenDietary = faker.helpers.arrayElements(
        dietaryRows,
        faker.number.int({ min: 0, max: Math.min(2, dietaryRows.length) }),
      );
      for (const d of chosenDietary)
        dietaryLinks.push({ userId: id, restrictionId: d.id });

      if (
        noAppEvent.id !== applicationEvent.id &&
        faker.datatype.boolean({ probability: 0.3 })
      ) {
        attendeeData.push({
          eventId: noAppEvent.id,
          userId: id,
          registeredAt: now,
        });
      }

      const roleSlug = (() => {
        const rnd = Math.random();
        if (rnd < 0.001) return 'admin'; // 0.1%
        if (rnd < 0.002) return 'judge'; // 0.1%
        if (rnd < 0.03) return 'organizer'; // 3%
        if (rnd < 0.07) return 'volunteer'; // 4%
        return 'participant'; // ~92%
      })();

      const roleObj = insertedRoles.find((r) => r.slug === roleSlug);
      if (roleObj) userRoles.push({ userId: id, roleId: roleObj.id });

      if (Math.random() < 0.01) {
        const extraRole = faker.helpers.arrayElement(
          insertedRoles.filter((r) => r.slug !== roleSlug),
        );
        userRoles.push({ userId: id, roleId: extraRole.id });
      }

      // ── Explicit user-permission overrides ──────────────────────────────
      if (['admin', 'organizer'].includes(roleSlug) && Math.random() < 0.2) {
        const chosenPerms = faker.helpers.arrayElements(insertedPerms, {
          min: 1,
          max: 2,
        });
        for (const p of chosenPerms)
          userPerms.push({ userId: id, permissionId: p.id });
      }
    }

    console.log(`🧩 Inserting chunk ${c + 1}/${chunkCount} (${size} users)...`);
    const t0 = performance.now();

    await db.transaction(async (tx) => {
      await tx.insert(user).values(users);
      await tx.insert(account).values(accounts);
      await tx.insert(session).values(sessions);
      await tx.insert(userProfiles).values(profiles);
      if (interestLinks.length > 0)
        await tx.insert(userInterests).values(interestLinks);
      if (dietaryLinks.length > 0)
        await tx.insert(userDietaryRestrictions).values(dietaryLinks);
      await tx.insert(eventApplications).values(applicationData);
      if (attendeeData.length > 0)
        await tx
          .insert(eventAttendees)
          .values(attendeeData)
          .onConflictDoNothing({
            target: [eventAttendees.eventId, eventAttendees.userId],
          });
      if (userRoles.length > 0) await tx.insert(userRole).values(userRoles);
      if (userPerms.length > 0)
        await tx.insert(userPermission).values(userPerms);
    });

    const t1 = performance.now();
    console.log(
      `✅ Chunk ${c + 1}/${chunkCount} done in ${(t1 - t0).toFixed(1)}ms`,
    );
  }

  console.log(
    `🎉 Done! Inserted ${COUNT} fake users with profiles, applications, and roles.`,
  );

  await seedEnvAdminUser(insertedRoles);
}

async function run() {
  try {
    await main();
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void run();
