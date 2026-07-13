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
  role,
  permission,
  rolePermissions,
  userRole,
  userPermission,
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

  return await seedRolesAndPermissions();
}

// ---------- Roles & permissions ----------
type RoleInsert = InferInsertModel<typeof role>;
type PermissionInsert = InferInsertModel<typeof permission>;
type RolePermissionInsert = InferInsertModel<typeof rolePermissions>;

async function seedRolesAndPermissions() {
  const baseRoles: RoleInsert[] = [
    { slug: 'admin', description: 'Full system administrator' },
    { slug: 'organizer', description: 'Manages event logistics and users' },
    { slug: 'judge', description: 'Evaluates hackathon projects' },
    { slug: 'volunteer', description: 'Supports event operations' },
    { slug: 'participant', description: 'Registered hackathon attendee' },
  ];

  const basePermissions: PermissionInsert[] = [
    { slug: 'user:read:all', description: 'View any user information' },
    { slug: 'user:write:all', description: 'Modify any user information' },
    {
      slug: 'user:all:all',
      description: 'Full user management (create/update/delete)',
    },
    { slug: 'role:read:all', description: 'View roles and their permissions' },
    { slug: 'role:write:all', description: 'Create, update and delete roles' },
    { slug: 'permission:read:all', description: 'View permissions' },
    {
      slug: 'permission:write:all',
      description: 'Create and delete permissions',
    },
    { slug: 'participant:read:all', description: 'View participant profiles' },
    { slug: 'participant:write:all', description: 'Edit participant data' },
    { slug: 'submission:read:all', description: 'View project submissions' },
    { slug: 'submission:write:all', description: 'Modify project submissions' },
    { slug: 'event:manage:all', description: 'Create and manage events' },
    { slug: 'checkin:write:all', description: 'Check participants in or out' },
    { slug: 'application:read:all', description: 'View event applications' },
    {
      slug: 'application:review:all',
      description: 'Approve or reject applications',
    },
  ];

  console.log('🧱 Seeding roles and permissions...');

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
        roleId: findRole('admin').id,
        permissionId: p.id,
      })),
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('event:manage:all').id,
      },
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('participant:read:all').id,
      },
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('participant:write:all').id,
      },
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('user:read:all').id,
      },
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('application:read:all').id,
      },
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('application:review:all').id,
      },
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('checkin:write:all').id,
      },
      {
        roleId: findRole('judge').id,
        permissionId: findPerm('submission:read:all').id,
      },
      {
        roleId: findRole('volunteer').id,
        permissionId: findPerm('participant:read:all').id,
      },
      {
        roleId: findRole('volunteer').id,
        permissionId: findPerm('checkin:write:all').id,
      },
      {
        roleId: findRole('participant').id,
        permissionId: findPerm('submission:read:all').id,
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
