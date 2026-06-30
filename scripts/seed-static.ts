import { client, db } from '@/utils/db';
import { InferInsertModel, Table, getTableName } from 'drizzle-orm';
import {
  genders,
  universities,
  majors,
  yearsOfStudy,
  interests,
  dietaryRestrictions,
  heardFromSources,
  applicationStatuses,
  rsvpStatuses,
  eventTypes,
} from '@/db/schema';
import {
  gendersList,
  universitiesList,
  majorsList,
  yearsOfStudyList,
  interestsList,
  dietaryRestrictionsList,
  heardFromSourcesList,
  applicationStatusesList,
  applicationStatusDisplayList,
  rsvpStatusesList,
  eventTypesList,
} from '@/types/lookups';

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

function defineApplicationStatusSeedTable(): SeedTable<
  typeof applicationStatuses
> {
  return {
    table: applicationStatuses,
    validLabels: applicationStatusesList as readonly string[],
    values: applicationStatusDisplayList.map((s) => ({
      label: s.label,
      title: s.title,
      description: s.description,
      variant: s.variant,
      isFinal: s.isFinal,
    })),
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
  defineApplicationStatusSeedTable(),
  defineSeedTable(rsvpStatuses, rsvpStatusesList),
  defineSeedTable(eventTypes, eventTypesList),
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

  console.log('✅ Static tables seeded successfully');
}

// ---------- Direct execution ----------
if (require.main === module) {
  void seedStaticTables()
    .catch((err) => {
      console.error('❌ Seed failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await client.end();
    });
}
