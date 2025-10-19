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

const COUNT = Number(process.env.SEED_COUNT ?? 1e5);
const CHUNK_SIZE = Number(process.env.SEED_CHUNK_SIZE ?? 2000);

type UserInsert = InferInsertModel<typeof user>;
type AccountInsert = InferInsertModel<typeof account>;
type SessionInsert = InferInsertModel<typeof session>;
type ParticipantInsert = InferInsertModel<typeof participants>;
type ParticipantInterestInsert = InferInsertModel<typeof participantInterests>;
type ParticipantDietaryInsert = InferInsertModel<
  typeof participantDietaryRestrictions
>;

async function main() {
  console.log(`🌱 Seeding ${COUNT} fake users in chunks of ${CHUNK_SIZE}...`);

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

  const now = new Date();
  const chunkCount = Math.ceil(COUNT / CHUNK_SIZE);

  for (let c = 0; c < chunkCount; c++) {
    const start = c * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, COUNT);
    const size = end - start;

    const users: UserInsert[] = [];
    const accounts: AccountInsert[] = [];
    const sessions: SessionInsert[] = [];
    const participantData: ParticipantInsert[] = [];
    const interestLinks: ParticipantInterestInsert[] = [];
    const dietaryLinks: ParticipantDietaryInsert[] = [];

    for (let i = 0; i < size; i++) {
      const id = randomUUID();
      const name = faker.person.fullName();

      // unique email per iteration
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
        createdAt: now,
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

    console.log(`🧩 Inserting chunk ${c + 1}/${chunkCount} (${size} users)...`);
    const t0 = performance.now();

    await db.transaction(async (tx) => {
      await tx.insert(user).values(users);
      await tx.insert(account).values(accounts);
      await tx.insert(session).values(sessions);
      await tx.insert(participants).values(participantData);
      await tx.insert(participantInterests).values(interestLinks);
      await tx.insert(participantDietaryRestrictions).values(dietaryLinks);
    });

    const t1 = performance.now();
    console.log(
      `✅ Chunk ${c + 1}/${chunkCount} done in ${(t1 - t0).toFixed(1)}ms`,
    );
  }

  console.log(`🎉 Done! Inserted ${COUNT} unique fake users.`);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
