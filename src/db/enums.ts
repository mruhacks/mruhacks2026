// src/db/seed-static.ts
import { db } from "@/utils/db";
import { InferInsertModel, Table, eq, getTableName } from "drizzle-orm";
import {
  genders,
  universities,
  majors,
  yearsOfStudy,
  interests,
  dietaryRestrictions,
  heardFromSources,
} from "@/db/schema";

// ---------- Domain constants & types ----------
export const gendersList = [
  "Male",
  "Female",
  "Non-binary",
  "Other",
  "Prefer not to say",
] as const;
export type Gender = (typeof gendersList)[number];

export const universitiesList = [
  "Mount Royal University",
  "University of Calgary",
  "University of Alberta",
  "University of Lethbridge",
  "MacEwan University",
  "SAIT",
  "NAIT",
  "Other / Not listed",
] as const;
export type University = (typeof universitiesList)[number];

export const majorsList = [
  "Computer Science",
  "Software Engineering",
  "Information Systems",
  "Data Science",
  "Cybersecurity",
  "Computer Engineering",
  "UX / UI Design",
  "Game Development",
  "Other / Custom",
] as const;
export type Major = (typeof majorsList)[number];

export const yearsOfStudyList = ["1st", "2nd", "3rd", "4th", "4th+"] as const;
export type YearOfStudy = (typeof yearsOfStudyList)[number];

export const interestsList = [
  "Mobile App Development",
  "Web Development",
  "Data Science and ML",
  "UX / UI Design",
  "Game Development",
] as const;
export type Interest = (typeof interestsList)[number];

export const dietaryRestrictionsList = [
  "Vegetarian",
  "Vegan",
  "Halal",
  "Kosher",
  "Gluten-free",
  "Peanuts / Tree-nuts Allergy",
  "Other",
] as const;
export type DietaryRestriction = (typeof dietaryRestrictionsList)[number];

export const heardFromSourcesList = [
  "Poster",
  "Friend / Classmate",
  "Classroom Visit",
  "Social Media",
  "Professor / Course Announcement",
  "Other",
] as const;
export type HeardFromSource = (typeof heardFromSourcesList)[number];

// ---------- Generic table helper ----------
interface SeedTable<TTable extends Table> {
  table: TTable;
  values: InferInsertModel<TTable>[];
  validLabels: readonly string[];
}

function defineSeedTable<TTable extends Table>(
  table: TTable,
  validLabels: readonly string[],
): SeedTable<TTable> {
  return {
    table,
    validLabels,
    values: validLabels.map((label) => ({
      label,
    })) as InferInsertModel<TTable>[],
  };
}

// ---------- Table registry ----------
const tables = [
  defineSeedTable(genders, gendersList),
  defineSeedTable(universities, universitiesList),
  defineSeedTable(majors, majorsList),
  defineSeedTable(yearsOfStudy, yearsOfStudyList),
  defineSeedTable(interests, interestsList),
  defineSeedTable(dietaryRestrictions, dietaryRestrictionsList),
  defineSeedTable(heardFromSources, heardFromSourcesList),
] satisfies SeedTable<Table>[];

// ---------- Seeder ----------
export async function seedStaticTables() {
  for (const { table, values, validLabels } of tables) {
    // Insert new values idempotently
    await db.insert(table).values(values).onConflictDoNothing();

    // Runtime sanity check for unexpected labels
    const rows = await db.select().from(table);
    const invalid = rows.filter((r) => !validLabels.includes(r.label));

    if (invalid.length > 0) {
      console.warn(
        `⚠️  Unexpected ${getTableName(table)} values found:`,
        invalid.map((r) => r.label),
      );
    }
  }

  console.log("✅ Static tables seeded successfully");
}

// ---------- Direct execution ----------
if (require.main === module) {
  seedStaticTables().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
}
