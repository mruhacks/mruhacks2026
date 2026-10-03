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
  eventTerms,
  userProfiles,
  userProfileAbout,
  userInterests,
  userDietaryRestrictions,
  eventParticipants,
  eventArticles,
  genders,
  universities,
  majors,
  yearsOfStudy,
  interests,
  dietaryRestrictions,
  participationStatuses,
  userRole,
  userPermission,
} from '@/db/schema';
import type { InferInsertModel } from 'drizzle-orm';
import { eq, isNull, and } from 'drizzle-orm';
import { seedStaticTables } from './seed-static';
import { seedAdminOnboarding } from './seed-admin-onboarding';
import { createParticipationSeeder } from './seed-participation';
import { createResumeSeeder } from './seed-resumes';
import { otherTextKey } from '@/lib/other-option';
import { EVENT_TIME_ZONE } from '@/lib/datetime';

// ── Stable question UUIDs (deterministic for seed data consistency) ────────
const Q_ATTENDED_BEFORE = '11111111-0000-0000-0000-000000000001';
const Q_ACCOMMODATIONS = '11111111-0000-0000-0000-000000000002';
const Q_NEEDS_PARKING = '11111111-0000-0000-0000-000000000003';
const Q_HEARD_FROM = '11111111-0000-0000-0000-000000000004';
const Q_CONSENT_INFO = '11111111-0000-0000-0000-000000000005';
const Q_CONSENT_SPONSOR = '11111111-0000-0000-0000-000000000006';
const Q_CONSENT_MEDIA = '11111111-0000-0000-0000-000000000007';
const Q_WORKSHOPS_INTERESTED = '11111111-0000-0000-0000-000000000008';
const Q_HACKATHONS_ATTENDED = '11111111-0000-0000-0000-000000000009';

// ── Stable option UUIDs for heard_from question ───────────────────────────
const OPT_POSTER = '22222222-0000-0000-0000-000000000001';
const OPT_FRIEND = '22222222-0000-0000-0000-000000000002';
const OPT_CLASSROOM = '22222222-0000-0000-0000-000000000003';
const OPT_SOCIAL = '22222222-0000-0000-0000-000000000004';
const OPT_PROFESSOR = '22222222-0000-0000-0000-000000000005';
const OPT_OTHER = '22222222-0000-0000-0000-000000000006';

// Skewed weights for how applicants heard about the event, so the chart
// shows a real-looking shape instead of six equal bars.
const HEARD_FROM_WEIGHTS = [
  { weight: 20, value: OPT_POSTER },
  { weight: 20, value: OPT_FRIEND },
  { weight: 15, value: OPT_CLASSROOM },
  { weight: 35, value: OPT_SOCIAL },
  { weight: 5, value: OPT_PROFESSOR },
  { weight: 5, value: OPT_OTHER },
];

// ── Stable option UUIDs for the workshops-interested question ────────────
const OPT_WORKSHOP_WEB = '22222222-0000-0000-0000-000000000007';
const OPT_WORKSHOP_AI = '22222222-0000-0000-0000-000000000008';
const OPT_WORKSHOP_HARDWARE = '22222222-0000-0000-0000-000000000009';
const OPT_WORKSHOP_DESIGN = '22222222-0000-0000-0000-000000000010';
const OPT_WORKSHOP_GIT = '22222222-0000-0000-0000-000000000011';

// Skewed weights driving which workshops get picked more often, so the
// multi_select chart shows a real-looking shape rather than equal bars.
const WORKSHOP_WEIGHTS = [
  { weight: 35, value: OPT_WORKSHOP_AI },
  { weight: 25, value: OPT_WORKSHOP_WEB },
  { weight: 15, value: OPT_WORKSHOP_DESIGN },
  { weight: 15, value: OPT_WORKSHOP_GIT },
  { weight: 10, value: OPT_WORKSHOP_HARDWARE },
];

/** Weighted, duplicate-free sample of `count` workshop option values. */
function pickWeightedWorkshops(count: number): string[] {
  const pool = [...WORKSHOP_WEIGHTS];
  const picked: string[] = [];
  for (let n = 0; n < count && pool.length > 0; n++) {
    const choice = faker.helpers.weightedArrayElement(pool);
    picked.push(choice);
    const idx = pool.findIndex((p) => p.value === choice);
    if (idx >= 0) pool.splice(idx, 1);
  }
  return picked;
}

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
type UserProfileAboutInsert = InferInsertModel<typeof userProfileAbout>;
type UserInterestInsert = InferInsertModel<typeof userInterests>;
type UserDietaryInsert = InferInsertModel<typeof userDietaryRestrictions>;
type EventParticipantInsert = InferInsertModel<typeof eventParticipants>;
type UserRoleInsert = InferInsertModel<typeof userRole>;
type UserPermissionInsert = InferInsertModel<typeof userPermission>;

// ── Seed events ───────────────────────────────────────────────────────────
async function seedEvents() {
  const existing = await db.select().from(events);
  const eventInserts: EventInsert[] = [
    {
      name: 'MRUHacks 2026',
      // Gives the seeded dev environment one event reachable by a readable
      // URL (/dashboard/events/mruhacks-2026) as well as by its uuid.
      slug: 'mruhacks-2026',
      hasApplication: true,
      capacity: null,
      isFeatured: !existing.some((event) => event.isFeatured),
      teamsEnabled: true,
      maxTeamSize: 5,
      applicationQuestions: [
        {
          id: Q_ATTENDED_BEFORE,
          label: 'Have you attended a hackathon before?',
          type: 'boolean' as const,
          required: true,
          showInReports: true,
          order: 1,
          active: true,
        },
        {
          id: Q_HACKATHONS_ATTENDED,
          label: 'How many hackathons have you attended?',
          type: 'number' as const,
          required: false,
          showInReports: true,
          order: 2,
          active: true,
        },
        {
          id: Q_HEARD_FROM,
          label: 'How did you hear about us?',
          type: 'single_select' as const,
          required: true,
          showInReports: true,
          order: 3,
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
          id: Q_WORKSHOPS_INTERESTED,
          label: 'Which workshops interest you?',
          type: 'multi_select' as const,
          required: false,
          showInReports: true,
          order: 4,
          active: true,
          options: [
            { value: OPT_WORKSHOP_WEB, label: 'Web development', active: true },
            {
              value: OPT_WORKSHOP_AI,
              label: 'AI / machine learning',
              active: true,
            },
            {
              value: OPT_WORKSHOP_HARDWARE,
              label: 'Hardware & IoT',
              active: true,
            },
            {
              value: OPT_WORKSHOP_DESIGN,
              label: 'UI / UX design',
              active: true,
            },
            {
              value: OPT_WORKSHOP_GIT,
              label: 'Git & collaboration workflows',
              active: true,
            },
          ],
        },
        {
          id: Q_NEEDS_PARKING,
          label: 'Do you need a parking pass?',
          type: 'boolean' as const,
          required: true,
          // Deliberately left out of reports so the stats view's filtering
          // is visibly proven to exclude a flagged-off summarizable question.
          showInReports: false,
          order: 5,
          active: true,
        },
        {
          id: Q_ACCOMMODATIONS,
          label: 'Do you require any accommodations for the event?',
          type: 'long_text' as const,
          required: false,
          order: 6,
          active: true,
        },
        {
          id: Q_CONSENT_INFO,
          label:
            'I consent to MRUHacks storing my application information for the purpose of running this event.',
          type: 'boolean' as const,
          required: true,
          showInReports: true,
          order: 7,
          active: true,
        },
        {
          id: Q_CONSENT_SPONSOR,
          label: 'I consent to sharing my information with event sponsors.',
          type: 'boolean' as const,
          required: true,
          showInReports: true,
          order: 8,
          active: true,
        },
        {
          id: Q_CONSENT_MEDIA,
          label:
            'I consent to being photographed or filmed for promotional use during the event.',
          type: 'boolean' as const,
          required: true,
          showInReports: true,
          order: 9,
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
  const seededEvents: (typeof events.$inferSelect)[] = [];
  for (const fixture of eventInserts) {
    const match = existing.find(
      (event) =>
        event.name === fixture.name &&
        event.hasApplication === fixture.hasApplication,
    );
    if (match) {
      seededEvents.push(match);
    } else {
      const [inserted] = await db.insert(events).values(fixture).returning();
      seededEvents.push(inserted);
    }
  }
  const [applicationEvent, noAppEvent] = seededEvents;
  await seedHackathonSchedule(applicationEvent.id);
  console.log('✅ Seed events ready.');
  return { applicationEvent, noAppEvent };
}

/** Seed the schedule for the next Friday–Sunday weekend in Mountain time. */
async function seedHackathonSchedule(parentEventId: string) {
  const schedule = [
    [
      'Participant Check-In Opens',
      'Friday 7:30 PM',
      'Friday 9:00 PM',
      'Ross Glenn Hall',
    ],
    ['Opening Ceremony', 'Friday 8:30 PM', 'Friday 9:00 PM', 'Ross Glenn Hall'],
    ['Hacking Begins', 'Friday 9:00 PM', 'Sunday 9:00 AM', null],
    ['Dinner Served', 'Friday 9:15 PM', 'Friday 10:00 PM', 'Ideas Lounge'],
    ['Games', 'Friday 11:00 PM', 'Saturday 1:15 AM', 'Ideas Lounge'],
    [
      'Midnight Snack',
      'Saturday 12:00 AM',
      'Saturday 12:30 AM',
      'Ideas Lounge',
    ],
    [
      'Breakfast Served',
      'Saturday 9:00 AM',
      'Saturday 10:00 AM',
      'Ideas Lounge',
    ],
    ['Scavenger Hunt', 'Saturday 10:00 AM', 'Sunday 12:00 AM', null],
    [
      'Quantum Computing Tech Presentation',
      'Saturday 12:15 PM',
      'Saturday 1:15 PM',
      null,
    ],
    ['Lunch Served', 'Saturday 12:00 PM', 'Saturday 1:00 PM', 'Ideas Lounge'],
    ['Typing Test', 'Saturday 2:00 PM', 'Saturday 3:00 PM', 'Ideas Lounge'],
    ['Therapy Dogs', 'Saturday 3:00 PM', 'Saturday 6:00 PM', 'Ideas Lounge'],
    ['Ice Cream', 'Saturday 4:00 PM', 'Saturday 4:30 PM', null],
    ['Dinner Served', 'Saturday 6:30 PM', 'Saturday 7:30 PM', 'Ideas Lounge'],
    ['Games', 'Saturday 11:00 PM', 'Sunday 1:15 AM', 'Ideas Lounge'],
    ['Midnight Snack', 'Sunday 12:00 AM', 'Sunday 12:30 AM', 'Ideas Lounge'],
    ['Breakfast Served', 'Sunday 9:00 AM', 'Sunday 10:00 AM', 'Ideas Lounge'],
    [
      'Hacking Ends / Submissions Due',
      'Sunday 9:00 AM',
      'Sunday 9:00 AM',
      null,
    ],
    ['Judging', 'Sunday 10:00 AM', 'Sunday 12:00 PM', 'Ross Glenn Hall'],
    ['Lunch', 'Sunday 12:45 PM', 'Sunday 1:45 PM', 'Ideas Lounge'],
    ['Closing Ceremony', 'Sunday 1:30 PM', 'Sunday 2:30 PM', 'Ross Glenn Hall'],
  ] as const;

  const weekdayOffsets = { Friday: 0, Saturday: 1, Sunday: 2 } as const;
  const nowParts = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    nowParts.find((item) => item.type === type)!.value;
  const weekdayIndex = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }[part('weekday') as 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'];
  const friday = new Date(
    Date.UTC(
      Number(part('year')),
      Number(part('month')) - 1,
      Number(part('day')) + ((5 - weekdayIndex + 7) % 7),
    ),
  );
  const eventDate = (weekday: keyof typeof weekdayOffsets, time: string) => {
    const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(time);
    if (!match) throw new Error(`Invalid seeded schedule time: ${time}`);
    const [, rawHour, minute, period] = match;
    let hour = Number(rawHour) % 12;
    if (period === 'PM') hour += 12;
    const day = new Date(
      Date.UTC(
        friday.getUTCFullYear(),
        friday.getUTCMonth(),
        friday.getUTCDate() + weekdayOffsets[weekday],
      ),
    );

    // Resolve the venue wall clock without using the process timezone.
    const desired = Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      hour,
      Number(minute),
    );
    let instant = desired;
    for (let attempt = 0; attempt < 2; attempt++) {
      const viewed = new Date(instant);
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: EVENT_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(viewed);
      const values = Object.fromEntries(
        parts.map(({ type, value }) => [type, value]),
      );
      const represented = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        Number(values.hour),
        Number(values.minute),
      );
      instant += desired - represented;
    }
    return new Date(instant);
  };

  const dates = schedule.map(([name, start, end, location]) => {
    const toInstant = (label: string) => {
      const match = /^(Friday|Saturday|Sunday) (.+)$/.exec(label);
      if (!match) throw new Error(`Invalid seeded schedule time: ${label}`);
      return eventDate(match[1] as keyof typeof weekdayOffsets, match[2]);
    };
    return {
      parentEventId,
      name,
      startsAt: toInstant(start),
      endsAt: toInstant(end),
      location,
      slug: null,
      hasApplication: false,
      applicationQuestions: [],
      teamsEnabled: false,
      isFeatured: false,
      capacityVisible: false,
    };
  });

  await db
    .update(events)
    .set({
      startsAt: eventDate('Friday', '7:30 PM'),
      endsAt: eventDate('Sunday', '2:30 PM'),
    })
    .where(eq(events.id, parentEventId));

  const existingSubevents = await db
    .select()
    .from(events)
    .where(eq(events.parentEventId, parentEventId));
  const existingByName = new Map<
    string,
    (typeof existingSubevents)[number][]
  >();
  for (const existing of existingSubevents) {
    const group = existingByName.get(existing.name) ?? [];
    group.push(existing);
    existingByName.set(existing.name, group);
  }
  for (const group of existingByName.values()) {
    group.sort(
      (left, right) =>
        (left.startsAt?.getTime() ?? 0) - (right.startsAt?.getTime() ?? 0),
    );
  }
  const occurrenceByName = new Map<string, number>();

  for (const fixture of dates) {
    const occurrence = occurrenceByName.get(fixture.name) ?? 0;
    occurrenceByName.set(fixture.name, occurrence + 1);
    const existing = existingByName.get(fixture.name)?.[occurrence];
    if (existing) {
      await db.update(events).set(fixture).where(eq(events.id, existing.id));
    } else {
      await db.insert(events).values(fixture);
    }
  }
}

// ── Seed markdown content (event descriptions + wiki) ────────────────────

// Internal links are built from the event id so the seeded content actually
// navigates, rather than shipping `#` placeholders that look like a bug.
const hackathonDescription = (eventId: string) =>
  `
MRUHacks is Mount Royal University’s largest student-run hackathon, bringing students together for an immersive 36-hour experience focused on building, collaboration, and learning.

You can think of a hackathon as a software science fair. Anyone with an interest in technology attends a hackathon to learn, build & share their creations over the course of a weekend, in a relaxed and welcoming atmosphere. You will bring your ideas to life through technology over the course of 36 hours before showcasing them to a team of judges.
  `;

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

const DEMO_EVENT_TERMS = `## Hackathon rules

- Treat participants, mentors, volunteers, and staff with respect. Harassment, discrimination, threats, and unsafe conduct are not allowed.
- Follow organizer instructions, venue rules, and the published schedule. Report safety concerns to an organizer promptly.
- Build your competition submission during the event. Clearly credit pre-existing code, open-source libraries, third-party assets, and AI assistance.
- Respect intellectual property and software licenses. Do not copy another team's work, interfere with other projects, or access systems without permission.
- Follow the event's team-size, eligibility, submission, and judging rules. Organizers may disqualify submissions or remove participants for rule violations.
- Look after your belongings and equipment, and leave shared spaces clean.

## Photo and video release

I understand that photographs and video may be taken during the event. I give the event organizers permission to capture and use my image, likeness, and voice in event photographs and recordings for event reporting, educational materials, and promotion, including websites, social media, and future event announcements, without compensation.

I understand that published materials may be shared by others. I can contact the organizers before the event with questions about photography or to discuss available accommodations.

## Agreement

By accepting my spot, I confirm that I have read and agree to these Event Terms, including the hackathon rules and photo and video release.`;

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

  // Demo fixtures only; the production/static seed does not add event terms.
  await db.transaction(async (tx) => {
    const [event] = await tx
      .select({ termsId: events.termsId })
      .from(events)
      .where(eq(events.id, applicationEvent.id))
      .for('update');
    if (event.termsId) return;
    const [existing] = await tx
      .select({ id: eventTerms.id })
      .from(eventTerms)
      .where(eq(eventTerms.eventId, applicationEvent.id))
      .limit(1);
    if (existing) return; // Preserve an organizer's explicit removal of terms.
    const [version] = await tx
      .insert(eventTerms)
      .values({ eventId: applicationEvent.id, markdown: DEMO_EVENT_TERMS })
      .returning({ id: eventTerms.id });
    await tx
      .update(events)
      .set({ termsId: version.id, updatedAt: new Date() })
      .where(eq(events.id, applicationEvent.id));
  });

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
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'Admin';

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
  return { id: userId, name };
}

// ── Main user seeding ───────────────────────────────────────────────────
export async function seedDemoData() {
  const COUNT = Number(process.env.SEED_COUNT ?? 3e2);
  const CHUNK_SIZE = Number(process.env.SEED_CHUNK_SIZE ?? 2000);
  if (
    !Number.isSafeInteger(COUNT) ||
    COUNT < 0 ||
    !Number.isSafeInteger(CHUNK_SIZE) ||
    CHUNK_SIZE < 1
  ) {
    throw new Error(
      'SEED_COUNT must be a non-negative integer and SEED_CHUNK_SIZE must be a positive integer.',
    );
  }
  const seedResume = COUNT > 0 ? await createResumeSeeder() : null;
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
    db.select().from(participationStatuses),
  ]);

  const pendingReviewStatus = applicationStatusRows.find(
    (s) => s.label === 'pending_review',
  );
  const pendingReviewStatusId = pendingReviewStatus?.id ?? null;
  const deniedStatusId =
    applicationStatusRows.find((s) => s.label === 'denied')?.id ?? null;
  const waitlistedStatusId =
    applicationStatusRows.find((s) => s.label === 'waitlisted')?.id ?? null;
  const acceptedStatusId = applicationStatusRows.find(
    (s) => s.label === 'accepted',
  )?.id;
  if (
    !pendingReviewStatusId ||
    !deniedStatusId ||
    !waitlistedStatusId ||
    !acceptedStatusId
  ) {
    throw new Error('Seed static tables (participation_statuses) first.');
  }

  // Skewed status distribution so the admin stats status filter has
  // something real to filter, instead of every row being pending_review.
  const STATUS_WEIGHTS = [
    { weight: 30, value: pendingReviewStatusId },
    { weight: 15, value: deniedStatusId },
    { weight: 55, value: waitlistedStatusId },
  ];

  // Monotonic across the whole run (not per-chunk), so waitlist positions
  // never repeat.
  let waitlistCounter = 0;

  const now = new Date();
  const admin = await seedEnvAdminUser(insertedRoles);
  const seedParticipation = createParticipationSeeder(now, admin?.id);
  if (admin) {
    await seedAdminOnboarding(
      admin.id,
      admin.name,
      applicationEvent.id,
      noAppEvent.id,
      {
        [Q_ATTENDED_BEFORE]: true,
        [Q_HACKATHONS_ATTENDED]: 2,
        [Q_HEARD_FROM]: OPT_FRIEND,
        [Q_WORKSHOPS_INTERESTED]: [OPT_WORKSHOP_WEB],
        [Q_NEEDS_PARKING]: true,
        [Q_ACCOMMODATIONS]: 'None',
        [Q_CONSENT_INFO]: true,
        [Q_CONSENT_SPONSOR]: true,
        [Q_CONSENT_MEDIA]: true,
      },
      now,
    );
    await seedParticipation(applicationEvent.id, [admin.id]);
    await seedParticipation(noAppEvent.id, [admin.id]);
    console.log(
      '✅ Admin onboarding, registration, team, RSVP, and check-ins ready.',
    );
  }
  // Applications are spread over the ~6 weeks before "now" rather than all
  // sharing one instant, so createdAt-based charts show a real shape. These
  // stay real Date (UTC instant) objects throughout — never a bare
  // wall-clock string — per the datetime rule in AGENTS.md.
  const applicationWindowStart = new Date(
    now.getTime() - 1000 * 60 * 60 * 24 * 42,
  );
  // All reviews predate the historical RSVP waves created by the participation seed.
  const applicationWindowEnd = new Date(now.getTime() - 7 * 86_400_000);
  const chunkCount = Math.ceil(COUNT / CHUNK_SIZE);

  for (let c = 0; c < chunkCount; c++) {
    const start = c * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, COUNT);
    const size = end - start;

    const users: UserInsert[] = [];
    const accounts: AccountInsert[] = [];
    const sessions: SessionInsert[] = [];
    const profiles: UserProfileInsert[] = [];
    const profilesAbout: UserProfileAboutInsert[] = [];
    const interestLinks: UserInterestInsert[] = [];
    const dietaryLinks: UserDietaryInsert[] = [];
    const applicationData: EventParticipantInsert[] = [];
    const attendeeData: EventParticipantInsert[] = [];
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
        createdAt: applicationWindowStart,
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
        ...(await seedResume!(id)),
        createdAt: now,
        updatedAt: now,
      });

      profilesAbout.push({
        userId: id,
        universityId: university.id,
        majorId: major.id,
        yearOfStudyId: year.id,
        createdAt: now,
        updatedAt: now,
      });

      // ── Application status + review trail ───────────────────────────────
      const statusId = faker.helpers.weightedArrayElement(STATUS_WEIGHTS);
      const isDecided = statusId !== pendingReviewStatusId;

      const appCreatedAt = faker.date.between({
        from: applicationWindowStart,
        to: applicationWindowEnd,
      });
      const appUpdatedAt =
        appCreatedAt.getTime() < applicationWindowEnd.getTime()
          ? faker.date.between({ from: appCreatedAt, to: applicationWindowEnd })
          : applicationWindowEnd;
      const appReviewedAt = isDecided
        ? appCreatedAt.getTime() < appUpdatedAt.getTime()
          ? faker.date.between({ from: appCreatedAt, to: appUpdatedAt })
          : appUpdatedAt
        : null;
      const reviewedBy = isDecided ? (admin?.id ?? null) : null;
      const waitlistPosition =
        statusId === waitlistedStatusId ? ++waitlistCounter : null;

      // ── Question answers (skewed, with some left unanswered) ────────────
      const attendedBefore = faker.helpers.weightedArrayElement([
        { weight: 40, value: false },
        { weight: 60, value: true },
      ]);
      const hackathonsAttended = faker.helpers.maybe(
        () =>
          faker.helpers.weightedArrayElement([
            { weight: 40, value: 0 },
            { weight: 25, value: 1 },
            { weight: 15, value: 2 },
            { weight: 10, value: 3 },
            { weight: 10, value: faker.number.int({ min: 4, max: 10 }) },
          ]),
        { probability: 0.85 }, // ~15% leave this optional question unanswered
      );
      const heardFrom = faker.helpers.weightedArrayElement(HEARD_FROM_WEIGHTS);
      const workshopsInterested = faker.helpers.maybe(
        () => pickWeightedWorkshops(faker.number.int({ min: 1, max: 3 })),
        { probability: 0.8 }, // ~20% leave this optional question unanswered
      );
      const needsParking = faker.helpers.weightedArrayElement([
        { weight: 75, value: false },
        { weight: 25, value: true },
      ]);
      const consentSponsor = faker.helpers.weightedArrayElement([
        { weight: 90, value: true },
        { weight: 10, value: false },
      ]);
      const consentMedia = faker.helpers.weightedArrayElement([
        { weight: 90, value: true },
        { weight: 10, value: false },
      ]);

      const responses: Record<string, unknown> = {
        [Q_ATTENDED_BEFORE]: attendedBefore,
        [Q_HACKATHONS_ATTENDED]: hackathonsAttended,
        [Q_HEARD_FROM]: heardFrom,
        [Q_WORKSHOPS_INTERESTED]: workshopsInterested,
        [Q_NEEDS_PARKING]: needsParking,
        [Q_ACCOMMODATIONS]: faker.helpers.maybe(() => faker.lorem.sentence(), {
          probability: 0.25,
        }),
        [Q_CONSENT_INFO]: true,
        [Q_CONSENT_SPONSOR]: consentSponsor,
        [Q_CONSENT_MEDIA]: consentMedia,
      };
      if (heardFrom === OPT_OTHER) {
        // "Other" was picked — also write the free-text sibling so the
        // other-text rendering path is exercised in seeded data.
        responses[otherTextKey(Q_HEARD_FROM)] = faker.lorem.sentence();
      }

      applicationData.push({
        eventId: applicationEvent.id,
        userId: id,
        statusId,
        createdAt: appCreatedAt,
        updatedAt: appUpdatedAt,
        reviewedAt: appReviewedAt,
        reviewedBy,
        waitlistPosition,
        responses,
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
        // A signup for an event without an application is a participant
        // who is `accepted` from the start.
        attendeeData.push({
          eventId: noAppEvent.id,
          userId: id,
          statusId: acceptedStatusId,
          createdAt: applicationWindowEnd,
          updatedAt: applicationWindowEnd,
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
      await tx.insert(userProfileAbout).values(profilesAbout);
      if (interestLinks.length > 0)
        await tx.insert(userInterests).values(interestLinks);
      if (dietaryLinks.length > 0)
        await tx.insert(userDietaryRestrictions).values(dietaryLinks);
      await tx.insert(eventParticipants).values(applicationData);
      if (attendeeData.length > 0)
        await tx
          .insert(eventParticipants)
          .values(attendeeData)
          .onConflictDoNothing({
            target: [eventParticipants.eventId, eventParticipants.userId],
          });
      if (userRoles.length > 0) await tx.insert(userRole).values(userRoles);
      if (userPerms.length > 0)
        await tx.insert(userPermission).values(userPerms);
    });

    const userIds = users.map((user) => user.id!);
    await seedParticipation(applicationEvent.id, userIds);
    await seedParticipation(noAppEvent.id, userIds);

    const t1 = performance.now();
    console.log(
      `✅ Chunk ${c + 1}/${chunkCount} done in ${(t1 - t0).toFixed(1)}ms`,
    );
  }

  console.log(
    `🎉 Done! Inserted ${COUNT} fake users with profiles, resumes, applications, roles, teams, RSVPs, and check-ins.`,
  );
}

async function run() {
  try {
    await seedDemoData();
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (require.main === module) void run();
