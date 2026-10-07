import 'dotenv/config';
import { randomUUID } from 'crypto';
import { faker } from '@faker-js/faker';
import { eq, like } from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';
import { client, db } from '@/utils/db';
import {
  checkIns,
  eventJudges,
  eventParticipants,
  events,
  genders,
  judgingCriteria,
  majors,
  marketingConsents,
  participationStatuses,
  privacyAcceptances,
  submissions,
  teamMembers,
  teams,
  termsAcceptances,
  universities,
  user,
  userProfileAbout,
  userProfileProfessional,
  userProfiles,
  yearsOfStudy,
} from '@/db/schema';
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '@/lib/consent';
import { generateTeamCode } from '@/lib/team-code';

const USAGE = `
Usage:
  pnpm db:seed:judging

Seeds a separate "Expo Judging Demo" event (/dashboard/events/expo-judging-demo)
that is ready to start expo judging: in progress, past its submission
deadline, with checked-in teams, published projects (plus one draft that
stays out of the pool), criteria, and a roster of onboarded judges. No votes
are cast.

Needs the base seed first (pnpm db:seed). Re-running replaces the demo event
and its seeded users. If SEED_ADMIN_EMAIL is set, that account joins the
roster too.

Env:
  JUDGING_SEED_PROJECTS   Number of projects (default 24)
  JUDGING_SEED_JUDGES     Number of judges, besides the admin (default 8)
`.trim();

const EVENT_SLUG = 'expo-judging-demo';
/** Every seeded user's address ends in this, so a re-run can find them. */
const EMAIL_DOMAIN = 'expo-judging.example.com';

const HOUR = 3_600_000;

const CRITERIA = [
  {
    name: 'Innovation',
    description:
      'How original is the idea, and how well does it solve a real problem?',
  },
  {
    name: 'Technical difficulty',
    description: 'How ambitious is what they built in the time they had?',
  },
  {
    name: 'Design',
    description: 'Is it polished, usable, and pleasant to interact with?',
  },
  {
    name: 'Presentation',
    description: 'How clearly did the team demo and explain their project?',
  },
];

const PROJECT_TITLES = [
  'Parkade Pal',
  'StudyBuddy AI',
  'Bow River Watch',
  'FridgeFriend',
  'TransitTrack YYC',
  'Chinook Forecaster',
  'Lecture Lens',
  'GreenCommute',
  'Pocket Pharmacist',
  'Sign2Text',
  'Hackathon Matchmaker',
  'Campus Lost & Found',
  'MealPlanr',
  'Budget Bison',
  'Wildfire Watchtower',
  'CodeReview Copilot',
  'Plant Parent',
  'Snow Day Predictor',
  'Accessible Atlas',
  'Resume Roaster',
  'TutorTime',
  'Night Bus Notifier',
  'Recipe Remix',
  'Volunteer Valet',
];

type UserInsert = InferInsertModel<typeof user>;

function readCount(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run: this script deletes and recreates data.');
    console.error('It is disabled when NODE_ENV=production.');
    process.exit(1);
  }
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function projectMarkdown(title: string): string {
  return [
    `## Inspiration`,
    faker.lorem.paragraph(),
    `## What ${title} does`,
    faker.lorem.paragraph(),
    `## How we built it`,
    `- ${faker.hacker.verb()} the ${faker.hacker.noun()} with ${faker.helpers.arrayElement(['Next.js', 'Flask', 'Rust', 'Swift', 'Unity', 'an Arduino'])}`,
    `- ${faker.hacker.phrase()}`,
    `## What's next`,
    faker.lorem.sentences(2),
  ].join('\n\n');
}

async function main(): Promise<void> {
  assertNotProduction();
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(USAGE);
    return;
  }

  const PROJECTS = readCount('JUDGING_SEED_PROJECTS', 24);
  const JUDGES = readCount('JUDGING_SEED_JUDGES', 8);
  faker.seed(2026);
  const now = new Date();

  // ── Depends on the base seed: static tables and the main event ──────────
  const [[baseEvent], statuses, [gender], universityRows, majorRows, yearRows] =
    await Promise.all([
      db
        .select({ id: events.id })
        .from(events)
        .where(eq(events.slug, 'mruhacks-2026')),
      db.select().from(participationStatuses),
      db.select().from(genders).where(eq(genders.label, 'Prefer not to say')),
      db.select().from(universities),
      db.select().from(majors),
      db.select().from(yearsOfStudy),
    ]);
  const accepted = statuses.find((row) => row.label === 'accepted');
  if (!baseEvent || !accepted || !gender || universityRows.length === 0) {
    console.error(
      'The base seed has not been run. Run `pnpm db:seed` first.\n',
    );
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const [admin] = adminEmail
    ? await db
        .select({ id: user.id, email: user.email })
        .from(user)
        .where(eq(user.email, adminEmail))
    : [];

  const result = await db.transaction(async (tx) => {
    // ── Replace any previous run ───────────────────────────────────────────
    // Deleting the event cascades to its teams, submissions, criteria and
    // roster; then the seeded users go.
    await tx.delete(events).where(eq(events.slug, EVENT_SLUG));
    await tx.delete(user).where(like(user.email, `%@${EMAIL_DOMAIN}`));

    // ── Event: in progress, submissions closed, judging window open ────────
    const [event] = await tx
      .insert(events)
      .values({
        name: 'Expo Judging Demo',
        slug: EVENT_SLUG,
        descriptionMarkdown:
          'A seeded hackathon whose submissions have closed and whose expo judging is ready to start.',
        hasApplication: true,
        teamsEnabled: true,
        maxTeamSize: 4,
        location: 'Mount Royal University, Calgary',
        startsAt: new Date(now.getTime() - 24 * HOUR),
        submissionsCloseAt: new Date(now.getTime() - HOUR),
        endsAt: new Date(now.getTime() + 24 * HOUR),
      })
      .returning();

    await tx.insert(judgingCriteria).values(
      CRITERIA.map((criterion, position) => ({
        eventId: event.id,
        position,
        ...criterion,
      })),
    );

    // ── Participants, teams and their projects ─────────────────────────────
    const users: UserInsert[] = [];
    const rosters: string[][] = [];
    for (let p = 0; p < PROJECTS; p++) {
      const roster: string[] = [];
      const size = faker.number.int({ min: 1, max: 4 });
      for (let m = 0; m < size; m++) {
        const id = randomUUID();
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();
        users.push({
          id,
          name: `${firstName} ${lastName}`,
          email: `${slugify(`${firstName}.${lastName}`)}.${users.length}@${EMAIL_DOMAIN}`,
          emailVerified: true,
          createdAt: new Date(now.getTime() - 30 * 24 * HOUR),
          updatedAt: now,
        });
        roster.push(id);
      }
      rosters.push(roster);
    }
    await tx.insert(user).values(users);
    await tx.insert(userProfiles).values(
      users.map((row) => ({
        userId: row.id!,
        fullName: row.name,
        genderId: gender.id,
      })),
    );
    await tx.insert(userProfileAbout).values(
      users.map((row) => ({
        userId: row.id!,
        universityId: faker.helpers.arrayElement(universityRows).id,
        majorId: faker.helpers.arrayElement(majorRows).id,
        yearOfStudyId: faker.helpers.arrayElement(yearRows).id,
      })),
    );
    const registeredAt = new Date(now.getTime() - 14 * 24 * HOUR);
    await tx.insert(eventParticipants).values(
      users.map((row) => ({
        eventId: event.id,
        userId: row.id!,
        statusId: accepted.id,
        reviewedAt: registeredAt,
        reviewedBy: admin?.id ?? null,
        createdAt: registeredAt,
        updatedAt: registeredAt,
      })),
    );
    await tx.insert(checkIns).values(
      users.map((row, index) => ({
        userId: row.id!,
        eventId: event.id,
        checkedInBy: admin?.id ?? null,
        checkedInAt: new Date(
          event.startsAt!.getTime() + (index % 90) * 60_000,
        ),
      })),
    );

    const formedAt = new Date(event.startsAt!.getTime() + 2 * HOUR);
    for (let p = 0; p < PROJECTS; p++) {
      const roster = rosters[p];
      const [team] = await tx
        .insert(teams)
        .values({
          eventId: event.id,
          organizerId: roster[0],
          code: await generateTeamCode(event.id, tx),
          createdAt: formedAt,
          updatedAt: formedAt,
        })
        .returning();
      await tx.insert(teamMembers).values(
        roster.map((userId) => ({
          teamId: team.id,
          eventId: event.id,
          userId,
          joinedAt: formedAt,
        })),
      );

      const title =
        PROJECT_TITLES[p % PROJECT_TITLES.length] +
        (p >= PROJECT_TITLES.length
          ? ` ${Math.floor(p / PROJECT_TITLES.length) + 1}`
          : '');
      const repo = slugify(title);
      // The last team never published: it gets a table number but stays out
      // of the judging pool.
      const published = p !== PROJECTS - 1 || PROJECTS === 1;
      // Staggered so table numbers (ranked by created_at) follow `p`.
      const createdAt = new Date(formedAt.getTime() + p * 60_000);
      const publishedAt = new Date(
        event.submissionsCloseAt!.getTime() - (PROJECTS - p) * 60_000,
      );
      await tx.insert(submissions).values({
        eventId: event.id,
        teamId: team.id,
        title,
        markdown: projectMarkdown(title),
        repoUrl: `https://github.com/${slugify(faker.internet.username())}/${repo}`,
        demoUrl: faker.datatype.boolean({ probability: 0.6 })
          ? `https://${repo}.vercel.app`
          : null,
        videoUrl: faker.datatype.boolean({ probability: 0.5 })
          ? `https://youtu.be/${faker.string.alphanumeric(11)}`
          : null,
        published,
        publishedAt: published ? publishedAt : null,
        lastEditedBy: roster[0],
        createdAt,
        updatedAt: published ? publishedAt : createdAt,
      });
    }

    // ── Judges: onboarded (consent, personal, professional) and linked ─────
    const judges: UserInsert[] = Array.from({ length: JUDGES }, (_, j) => {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      return {
        id: randomUUID(),
        name: `${firstName} ${lastName}`,
        email: `judge${j + 1}@${EMAIL_DOMAIN}`,
        emailVerified: true,
        onboardingCompletedAt: now,
        createdAt: now,
        updatedAt: now,
      };
    });
    await tx.insert(user).values(judges);
    await tx.insert(userProfiles).values(
      judges.map((row) => ({
        userId: row.id!,
        fullName: row.name,
        genderId: gender.id,
      })),
    );
    await tx.insert(termsAcceptances).values(
      judges.map((row) => ({
        userId: row.id!,
        version: CURRENT_TERMS_VERSION,
        acceptedAt: now,
      })),
    );
    await tx.insert(privacyAcceptances).values(
      judges.map((row) => ({
        userId: row.id!,
        version: CURRENT_PRIVACY_VERSION,
        acceptedAt: now,
      })),
    );
    await tx
      .insert(marketingConsents)
      .values(
        judges.map((row) => ({
          userId: row.id!,
          optedIn: false,
          changedAt: now,
        })),
      );
    await tx.insert(userProfileProfessional).values(
      judges.map((row) => ({
        userId: row.id!,
        company: faker.company.name().slice(0, 255),
        jobTitle: faker.person.jobTitle().slice(0, 255),
      })),
    );

    const roster: { eventId: string; email: string; userId: string | null }[] =
      judges.map((row) => ({
        eventId: event.id,
        email: row.email,
        userId: row.id!,
      }));
    // Invited but hasn't signed in yet: linked on their first sign-in.
    roster.push({
      eventId: event.id,
      email: `invited.judge@${EMAIL_DOMAIN}`,
      userId: null,
    });

    if (admin) {
      // The admin finished the participant path in the base seed; judges
      // also need a professional profile, or the gate sends them to it.
      await tx
        .insert(userProfileProfessional)
        .values({
          userId: admin.id,
          company: 'MRUHacks',
          jobTitle: 'Organizer',
        })
        .onConflictDoNothing();
      roster.push({
        eventId: event.id,
        email: admin.email.toLowerCase(),
        userId: admin.id,
      });
    }
    await tx.insert(eventJudges).values(roster);

    return { event, participants: users.length, rosterSize: roster.length };
  });

  const eventId = result.event.id;
  console.log(`✅ Seeded "${result.event.name}" (${eventId}), ready to judge.`);
  console.log(
    `  Projects: ${PROJECTS} (${PROJECTS > 1 ? PROJECTS - 1 : 1} published)`,
  );
  console.log(`  Participants: ${result.participants}, all checked in`);
  console.log(`  Criteria: ${CRITERIA.map((c) => c.name).join(', ')}`);
  console.log(
    `  Roster: ${result.rosterSize} (judge1–judge${JUDGES}@${EMAIL_DOMAIN}, one not yet signed in${admin ? `, ${admin.email}` : ''})`,
  );
  console.log(`  Organizer page: /dashboard/admin/events/${eventId}/judging`);
  console.log(`  Judge console:  /dashboard/events/${eventId}/judge`);
  console.log(
    '  Judges sign in by magic link; in dev the email lands in Mailhog.',
  );
}

main()
  .catch((error) => {
    console.error('❌ Judging seed failed:');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
