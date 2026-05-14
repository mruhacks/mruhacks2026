import { db, client } from '@/utils/db';
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

// ---------- Table registry ----------
const tables = [
  defineSeedTable(genders, gendersList),
  defineSeedTable(universities, universitiesList),
  defineSeedTable(majors, majorsList),
  defineSeedTable(yearsOfStudy, yearsOfStudyList),
  defineSeedTable(interests, interestsList),
  defineSeedTable(dietaryRestrictions, dietaryRestrictionsList),
  defineSeedTable(heardFromSources, heardFromSourcesList),
  defineSeedTable(applicationStatuses, applicationStatusesList),
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
  seedStaticTables()
    .then(() => client.end())
    .catch((err) => {
      console.error('❌ Seed failed:', err);
      client.end().finally(() => process.exit(1));
    });
}
