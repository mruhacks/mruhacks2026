import "dotenv/config";
import { randomBytes, randomUUID } from "crypto";
import { faker } from "@faker-js/faker";

import { db } from "@/utils/db";
import {
  user,
  account,
  session,
  participants,
  participantInterests,
  participantDietaryRestrictions,
  genders,
  universities,
  majors,
  yearsOfStudy,
  interests,
  dietaryRestrictions,
  heardFromSources,
} from "@/db/schema";
import type { InferInsertModel } from "drizzle-orm";

const COUNT = Number(process.env.SEED_COUNT ?? 500);

type UserInsert = InferInsertModel<typeof user>;
type AccountInsert = InferInsertModel<typeof account>;
type SessionInsert = InferInsertModel<typeof session>;
type ParticipantInsert = InferInsertModel<typeof participants>;
type ParticipantInterestInsert = InferInsertModel<typeof participantInterests>;
type ParticipantDietaryInsert = InferInsertModel<
  typeof participantDietaryRestrictions
>;

async function main() {
  console.log(`🌱 Seeding ${COUNT} fake users + participants...`);

  // ────────────────────────────────
  // 1️⃣ Load lookup tables for valid FKs
  // ────────────────────────────────
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

  if (
    !genderRows.length ||
    !universityRows.length ||
    !majorRows.length ||
    !yearRows.length ||
    !interestRows.length ||
    !dietaryRows.length ||
    !heardRows.length
  ) {
    console.error("❌ Missing lookup data. Populate lookup tables first.");
    process.exit(1);
  }

  // ────────────────────────────────
  // 2️⃣ Generate fake data (fully typed)
  // ────────────────────────────────
  const users: UserInsert[] = [];
  const accounts: AccountInsert[] = [];
  const sessions: SessionInsert[] = [];
  const participantData: ParticipantInsert[] = [];
  const interestLinks: ParticipantInterestInsert[] = [];
  const dietaryLinks: ParticipantDietaryInsert[] = [];

  for (let i = 0; i < COUNT; i++) {
    const id = randomUUID();
    const name = faker.person.fullName();
    const email = faker.internet
      .email({ firstName: name.split(" ")[0] })
      .toLowerCase();

    users.push({
      id,
      name,
      email,
      emailVerified: faker.datatype.boolean(),
      image: faker.image.avatar(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    accounts.push({
      id: randomUUID(),
      accountId: randomUUID(),
      providerId: "credentials",
      userId: id,
      password: randomBytes(24).toString("hex"),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    sessions.push({
      id: randomUUID(),
      token: randomBytes(24).toString("hex"),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      ipAddress: faker.internet.ip(),
      userAgent: faker.internet.userAgent(),
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: id,
    });

    const gender = faker.helpers.arrayElement(genderRows);
    const university = faker.helpers.arrayElement(universityRows);
    const major = faker.helpers.arrayElement(majorRows);
    const year = faker.helpers.arrayElement(yearRows);
    const heardFrom = faker.helpers.arrayElement(heardRows);

    participantData.push({
      userId: id,
      fullName: name,
      attendedBefore: faker.datatype.boolean(),
      genderId: gender.id,
      universityId: university.id,
      majorId: major.id,
      yearOfStudyId: year.id,
      accommodations: faker.helpers.maybe(() => faker.lorem.sentence(), {
        probability: 0.25,
      }),
      needsParking: faker.datatype.boolean(),
      heardFromId: heardFrom.id,
      consentInfoUse: true,
      consentSponsorShare: faker.datatype.boolean({ probability: 0.9 }),
      consentMediaUse: faker.datatype.boolean({ probability: 0.9 }),
      createdAt: new Date(),
    });

    const chosenInterests = faker.helpers.arrayElements(
      interestRows,
      faker.number.int({ min: 1, max: Math.min(4, interestRows.length) }),
    );
    for (const it of chosenInterests) {
      interestLinks.push({ userId: id, interestId: it.id });
    }

    const chosenDietary = faker.helpers.arrayElements(
      dietaryRows,
      faker.number.int({ min: 0, max: Math.min(2, dietaryRows.length) }),
    );
    for (const d of chosenDietary) {
      dietaryLinks.push({ userId: id, restrictionId: d.id });
    }
  }

  // ────────────────────────────────
  // 3️⃣ Insert all in one transaction
  // ────────────────────────────────
  console.log("🧩 Inserting all records (single transaction)...");
  await db.transaction(async (tx) => {
    await tx.insert(user).values(users);
    await tx.insert(account).values(accounts);
    await tx.insert(session).values(sessions);
    await tx.insert(participants).values(participantData);
    await tx.insert(participantInterests).values(interestLinks);
    await tx.insert(participantDietaryRestrictions).values(dietaryLinks);
  });

  console.log(`✅ Done! Inserted ${COUNT} fake users.`);
  return;
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
