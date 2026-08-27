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
  eventArticles,
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
import { eq, isNull, and } from 'drizzle-orm';
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

// ── Stable article UUIDs (deterministic for seed data consistency) ────────
const ART_GETTING_STARTED = '33333333-0000-0000-0000-000000000001';
const ART_SCHEDULE = '33333333-0000-0000-0000-000000000002';
const ART_JUDGING = '33333333-0000-0000-0000-000000000003';

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
      teamsEnabled: true,
      maxTeamSize: 5,
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

// ── Seed markdown content (event descriptions + wiki) ────────────────────

// Internal links are built from the event id so the seeded content actually
// navigates, rather than shipping `#` placeholders that look like a bug.
const hackathonDescription = (eventId: string) =>
  `MRUHacks is Mount Royal University's **24-hour hackathon** — one weekend to build
something with people you have probably not met yet.

You do not need a team, an idea, or prior hackathon experience to apply. Roughly
half of every cohort is attending their first hackathon, and we run the weekend
with that in mind.

## What the weekend looks like

- **Friday evening** — check-in, opening ceremony, team formation
- **Saturday** — workshops, mentor office hours, meals, and a lot of building
- **Sunday morning** — submissions close, judging, closing ceremony

## What we provide

| | |
| --- | --- |
| Food | All meals, snacks and coffee for the full 24 hours |
| Space | A room to work in, and a quiet room to not work in |
| Mentors | Industry and senior-student mentors on the floor all weekend |
| Hardware | A lending library of sensors, microcontrollers and peripherals |

> Bring a laptop, a charger, and something to sleep on if you plan to stay
> overnight. Everything else is on us.

Applications are reviewed on a rolling basis. Read the
[event wiki](/dashboard/events/${eventId}/wiki) for schedules, judging criteria,
and the packing list.`;

const WORKSHOP_DESCRIPTION = `A hands-on **two-hour introduction to React** for students who already know some
JavaScript but have not built a component-based UI before.

We start from an empty Vite project and finish with a small app that fetches and
renders live data. You will leave with the project running on your own machine.

### What we cover

1. Components, props, and why the tree matters
2. State with \`useState\`, and the rules that come with hooks
3. Effects and data fetching — including when *not* to reach for \`useEffect\`
4. Composing it into something you would actually ship

### Before you arrive

\`\`\`bash
node --version   # 20 or newer
npm create vite@latest my-first-react-app -- --template react
\`\`\`

No application needed — just register and show up. Laptops required; we do not
have loaners for this one.`;

const gettingStartedArticle = (eventId: string) =>
  `Welcome to MRUHacks. This page covers everything you need between now and the
opening ceremony.

## Before the event

- [ ] Complete your application and watch for the acceptance email
- [ ] RSVP once you are accepted — unclaimed spots go to the waitlist
- [ ] Join the Discord (link is in your acceptance email)
- [ ] Skim the [schedule](/dashboard/events/${eventId}/wiki/schedule) so nothing
      is a surprise on Sunday

## What to bring

**Essential**

- Laptop and charger
- Student ID for check-in
- Water bottle

**If you are staying overnight**

- Sleeping bag or blanket, and a pillow
- Toiletries and a change of clothes
- Headphones

> We cannot store valuables. Anything you leave in the venue overnight, you
> leave at your own risk.

## Finding a team

Teams are **up to 5 people** and you can form one at any point before
submissions open. If you arrive solo, come to the team formation session right
after the opening ceremony — most solo attendees leave that session on a team.

You can also create a team in your dashboard and share the join code with people
you meet during the weekend.

## Getting help

Mentors wear coloured lanyards and are on the floor for the whole event. Flag
one down, or post in the \`#help\` channel on Discord and someone will come find
you.`;

const SCHEDULE_ARTICLE = `All times are **Mountain Time** and subject to small changes — we will announce
any updates in the Discord \`#announcements\` channel.

## Friday

| Time | What | Where |
| --- | --- | --- |
| 5:00 PM | Check-in opens | Main entrance |
| 6:30 PM | Opening ceremony | Auditorium |
| 7:15 PM | Team formation | Auditorium |
| 8:00 PM | **Hacking begins** | Everywhere |
| 9:00 PM | Late dinner | Atrium |

## Saturday

| Time | What | Where |
| --- | --- | --- |
| 8:00 AM | Breakfast | Atrium |
| 10:00 AM | Workshop: intro to Git for teams | Room B105 |
| 12:00 PM | Lunch | Atrium |
| 2:00 PM | Workshop: shipping a demo that works | Room B105 |
| 4:00 PM | Mentor office hours | Main floor |
| 6:30 PM | Dinner | Atrium |
| 11:00 PM | Midnight snack | Atrium |

## Sunday

| Time | What | Where |
| --- | --- | --- |
| 8:00 AM | Breakfast | Atrium |
| 10:00 AM | **Submissions close** | Devpost |
| 10:30 AM | Judging (science-fair format) | Main floor |
| 12:30 PM | Closing ceremony and prizes | Auditorium |

---

The quiet room is open the entire event. The main floor stays open overnight;
the auditorium is locked between sessions.`;

const JUDGING_ARTICLE = `> **Draft** — the rubric below is from last year and is still being reviewed by
> the organizing team. Do not treat the weightings as final.

## Submitting

Submissions close **Sunday at 10:00 AM sharp**. Submit on Devpost with:

1. A public repository link
2. A demo video, **3 minutes maximum**
3. A short written description of what you built and what you would do next

A project that misses the deadline can still be demoed, but it cannot be scored.

## How judging works

Judging is science-fair format: judges rotate between tables and you give the
same short demo several times. Budget about **4 minutes** of talking and leave
room for questions.

## Rubric

| Criterion | Weight | What judges are asking |
| --- | --- | --- |
| Technical execution | 30% | Does it work? Was it hard to build? |
| Originality | 25% | Have we seen twenty of these already? |
| Design and usability | 25% | Can a stranger use it without a tour? |
| Presentation | 20% | Did the demo make the idea land? |

## Rules

- All code must be written **during** the event. Libraries, frameworks and
  boilerplate generators are fine; a project you started last month is not.
- Assets you did not make are fine if you have the right to use them — credit
  them in your description.
- Teams of up to 5. No swapping members mid-event.

Questions about eligibility go to an organizer *before* you build, not after.`;

/**
 * Fills in the markdown surfaces: a description on each event, and a small
 * wiki for the hackathon.
 *
 * Additive only. A description is written only when the column is still NULL,
 * and articles are keyed on their stable UUIDs with `onConflictDoNothing`, so
 * re-running the seed against a database someone has been editing in never
 * overwrites their work.
 */
async function seedEventContent(
  applicationEvent: { id: string; name: string },
  noAppEvent: { id: string; name: string },
) {
  const descriptions = [
    {
      event: applicationEvent,
      markdown: hackathonDescription(applicationEvent.id),
    },
    { event: noAppEvent, markdown: WORKSHOP_DESCRIPTION },
  ];

  let described = 0;
  for (const { event, markdown } of descriptions) {
    const updated = await db
      .update(events)
      .set({ descriptionMarkdown: markdown, updatedAt: new Date() })
      .where(and(eq(events.id, event.id), isNull(events.descriptionMarkdown)))
      .returning({ id: events.id });
    described += updated.length;
  }
  console.log(
    described === descriptions.length
      ? `✅ Seeded ${described} event descriptions.`
      : `✅ Seeded ${described} event descriptions (${descriptions.length - described} already had one; left untouched).`,
  );

  // Two published and one draft, so the seeded database exercises both the
  // participant-visible path and the organizer-only draft badge.
  const articles: InferInsertModel<typeof eventArticles>[] = [
    {
      id: ART_GETTING_STARTED,
      eventId: applicationEvent.id,
      slug: 'getting-started',
      title: 'Getting started',
      bodyMarkdown: gettingStartedArticle(applicationEvent.id),
      published: true,
      sortOrder: 1,
    },
    {
      id: ART_SCHEDULE,
      eventId: applicationEvent.id,
      slug: 'schedule',
      title: 'Schedule',
      bodyMarkdown: SCHEDULE_ARTICLE,
      published: true,
      sortOrder: 2,
    },
    {
      id: ART_JUDGING,
      eventId: applicationEvent.id,
      slug: 'judging-and-submissions',
      title: 'Judging & submissions',
      bodyMarkdown: JUDGING_ARTICLE,
      published: false,
      sortOrder: 3,
    },
  ];

  const inserted = await db
    .insert(eventArticles)
    .values(articles)
    .onConflictDoNothing({ target: eventArticles.id })
    .returning({ id: eventArticles.id });

  console.log(
    `✅ Seeded ${inserted.length} of ${articles.length} wiki articles for ${applicationEvent.name} (2 published, 1 draft).`,
  );
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
  await seedEventContent(applicationEvent, noAppEvent);

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
