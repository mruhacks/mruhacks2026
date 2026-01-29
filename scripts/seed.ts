import "dotenv/config";
import { randomBytes, randomUUID } from "crypto";
import { faker } from "@faker-js/faker";
import { db } from "@/utils/db";
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
  heardFromSources,
  permission,
  role,
  userRole,
  userPermission,
  rolePermissions,
} from "@/db/schema";
import type { InferInsertModel } from "drizzle-orm";
import { seedStaticTables } from "@/db/enums";

const COUNT = Number(process.env.SEED_COUNT ?? 1e3);
const CHUNK_SIZE = Number(process.env.SEED_CHUNK_SIZE ?? 2000);

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
type RoleInsert = InferInsertModel<typeof role>;
type PermissionInsert = InferInsertModel<typeof permission>;
type UserRoleInsert = InferInsertModel<typeof userRole>;
type UserPermissionInsert = InferInsertModel<typeof userPermission>;
type RolePermissionInsert = InferInsertModel<typeof rolePermissions>;

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
      name: "MRUHacks 2026",
      hasApplication: true,
      applicationQuestions: [
        { key: "attended_before", label: "Have you attended before?", type: "boolean", required: true },
        { key: "accommodations", label: "Accessibility or accommodations", type: "text" },
        { key: "needs_parking", label: "Need parking?", type: "boolean" },
        { key: "heard_from_id", label: "How did you hear about us?", type: "select", required: true },
        { key: "consent_info_use", label: "Consent to use info", type: "boolean", required: true },
        { key: "consent_sponsor_share", label: "Consent to share with sponsors", type: "boolean", required: true },
        { key: "consent_media_use", label: "Consent to photos/videos", type: "boolean", required: true },
      ],
    },
    {
      name: "Intro to React Workshop",
      hasApplication: false,
    },
  ];
  const inserted = await db.insert(events).values(eventInserts).returning();
  const applicationEvent = inserted[0]!;
  const noAppEvent = inserted[1]!;
  console.log(`✅ Seeded ${inserted.length} events.`);
  return { applicationEvent, noAppEvent };
}

// ── Helper: seed base roles/permissions ─────────────────────────────────
async function seedRolesAndPermissions() {
  const baseRoles: RoleInsert[] = [
    { slug: "admin", description: "Full system administrator" },
    { slug: "organizer", description: "Manages event logistics and users" },
    { slug: "judge", description: "Evaluates hackathon projects" },
    { slug: "volunteer", description: "Supports event operations" },
    { slug: "participant", description: "Registered hackathon attendee" },
  ];

  const basePermissions: PermissionInsert[] = [
    { slug: "user:read", description: "View user information" },
    { slug: "user:write", description: "Modify user information" },
    { slug: "participant:read", description: "View participant profiles" },
    { slug: "participant:write", description: "Edit participant data" },
    { slug: "submission:read", description: "View project submissions" },
    { slug: "submission:write", description: "Modify project submissions" },
    { slug: "event:manage", description: "Create and manage events" },
  ];

  console.log("🧱 Seeding roles and permissions...");

  const result = await db.transaction(async (tx) => {
    await tx.delete(rolePermissions);
    await tx.delete(userRole);
    await tx.delete(userPermission);
    await tx.delete(role);
    await tx.delete(permission);

    const insertedRoles = await tx.insert(role).values(baseRoles).returning();
    const insertedPerms = await tx
      .insert(permission)
      .values(basePermissions)
      .returning();

    const findPerm = (slug: string) =>
      insertedPerms.find((p) => p.slug === slug)!;
    const findRole = (slug: string) =>
      insertedRoles.find((r) => r.slug === slug)!;

    const rolePerms: RolePermissionInsert[] = [
      ...insertedPerms.map((p) => ({
        roleId: findRole("admin").id,
        permissionId: p.id,
      })),
      {
        roleId: findRole("organizer").id,
        permissionId: findPerm("event:manage").id,
      },
      {
        roleId: findRole("organizer").id,
        permissionId: findPerm("participant:read").id,
      },
      {
        roleId: findRole("organizer").id,
        permissionId: findPerm("participant:write").id,
      },
      {
        roleId: findRole("judge").id,
        permissionId: findPerm("submission:read").id,
      },
      {
        roleId: findRole("volunteer").id,
        permissionId: findPerm("participant:read").id,
      },
      {
        roleId: findRole("participant").id,
        permissionId: findPerm("submission:read").id,
      },
    ];

    await tx.insert(rolePermissions).values(rolePerms);

    console.log(
      `✅ Seeded ${insertedRoles.length} roles, ${insertedPerms.length} permissions, and ${rolePerms.length} links.`,
    );

    return { insertedRoles, insertedPerms };
  });

  return result;
}

// ── Main user seeding ───────────────────────────────────────────────────
async function main() {
  const { insertedRoles, insertedPerms } = await seedRolesAndPermissions();
  const { applicationEvent, noAppEvent } = await seedEvents();

  console.log(`🌱 Seeding ${COUNT} fake users in chunks of ${CHUNK_SIZE}...`);

  await seedStaticTables();

  const [
    genderRows,
    universityRows,
    majorRows,
    yearRows,
    interestRows,
    dietaryRows,
    heardRows,
  ] = await Promise.all([
    db.select().from(genders),
    db.select().from(universities),
    db.select().from(majors),
    db.select().from(yearsOfStudy),
    db.select().from(interests),
    db.select().from(dietaryRestrictions),
    db.select().from(heardFromSources),
  ]);

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
        .username({ firstName: name.split(" ")[0] })
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
        providerId: "credentials",
        userId: id,
        password: randomBytes(24).toString("hex"),
        createdAt: now,
        updatedAt: now,
      });

      sessions.push({
        id: randomUUID(),
        token: randomBytes(24).toString("hex"),
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
      const heardFrom = faker.helpers.arrayElement(heardRows);

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
        createdAt: now,
        updatedAt: now,
        responses: {
          attended_before: faker.datatype.boolean(),
          accommodations: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.25 }),
          needs_parking: faker.datatype.boolean(),
          heard_from_id: heardFrom.id,
          consent_info_use: true,
          consent_sponsor_share: faker.datatype.boolean({ probability: 0.9 }),
          consent_media_use: faker.datatype.boolean({ probability: 0.9 }),
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
        if (rnd < 0.001) return "admin";
        if (rnd < 0.002) return "judge";
        if (rnd < 0.03) return "organizer";
        if (rnd < 0.07) return "volunteer";
        return "participant";
      })();

      const roleObj = insertedRoles.find((r) => r.slug === roleSlug);
      if (roleObj) userRoles.push({ userId: id, roleId: roleObj.id });

      if (Math.random() < 0.01) {
        const extraRole = faker.helpers.arrayElement(
          insertedRoles.filter((r) => r.slug !== roleSlug),
        );
        userRoles.push({ userId: id, roleId: extraRole.id });
      }

      if (["admin", "organizer"].includes(roleSlug) && Math.random() < 0.2) {
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
      await tx.insert(userInterests).values(interestLinks);
      await tx.insert(userDietaryRestrictions).values(dietaryLinks);
      await tx.insert(eventApplications).values(applicationData);
      await tx
        .insert(eventAttendees)
        .values(attendeeData)
        .onConflictDoNothing({
          target: [eventAttendees.eventId, eventAttendees.userId],
        });
      await tx.insert(userRole).values(userRoles);
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
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
