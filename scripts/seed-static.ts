import { client, db } from '@/utils/db';
import { InferInsertModel, Table, getTableName, getTableColumns, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import {
  gendersList,
  universitiesList,
  majorsList,
  yearsOfStudyList,
  interestsList,
  dietaryRestrictionsList,
  heardFromSourcesList,
  participationStatusesList,
  participationStatusDisplayList,
  eventTypesList,
} from '@/types/lookups';

// ---------- Generic table helper ----------
// Every statically seeded table is keyed by its unique `label` column: that's
// the stable identity the script uses to decide whether a row is new (insert),
// unchanged (leave alone), or already present but edited in code (update in
// place). Rows are only ever inserted/updated here — never deleted — so a
// static seed can never cascade into deleting rows that reference them.
interface SeedTable<TTable extends Table> {
  table: TTable;
  values: InferInsertModel<TTable>[];
  validLabels: readonly string[];
  // Columns besides `label` to refresh on conflict, e.g. when a status's
  // display copy changes in code. Omit for label-only tables.
  updatableColumns?: string[];
}

function defineSeedTable<TTable extends Table>(table: TTable, validLabels: readonly string[]): SeedTable<TTable> {
  return {
    table,
    validLabels,
    values: validLabels.map((label) => ({
      label,
    })) as InferInsertModel<TTable>[],
  };
}

function defineParticipationStatusSeedTable(): SeedTable<typeof schema.participationStatuses> {
  return {
    table: schema.participationStatuses,
    validLabels: participationStatusesList as readonly string[],
    values: participationStatusDisplayList.map((s) => ({
      label: s.label,
      title: s.title,
      description: s.description,
      variant: s.variant,
    })),
    updatableColumns: ['title', 'description', 'variant'],
  };
}

// ---------- Table registry ----------
const tables = [
  defineSeedTable(schema.genders, gendersList),
  defineSeedTable(schema.universities, universitiesList),
  defineSeedTable(schema.majors, majorsList),
  defineSeedTable(schema.yearsOfStudy, yearsOfStudyList),
  defineSeedTable(schema.interests, interestsList),
  defineSeedTable(schema.dietaryRestrictions, dietaryRestrictionsList),
  defineSeedTable(schema.heardFromSources, heardFromSourcesList),
  defineParticipationStatusSeedTable(),
  defineSeedTable(schema.eventTypes, eventTypesList),
] satisfies SeedTable<Table>[];

// ---------- Seeder ----------
export async function seedStaticTables() {
  for (const { table, values, validLabels, updatableColumns } of tables) {
    // Upsert by the unique `label` key: new labels are inserted, existing
    // ones are left alone (or have their non-key columns refreshed) — rows
    // are never deleted, so nothing that references them can be wiped.
    const columns = getTableColumns(table) as Record<string, AnyPgColumn>;
    const labelColumn = columns.label;

    if (updatableColumns?.length) {
      const set = Object.fromEntries(updatableColumns.map((col) => [col, sql.raw(`excluded."${columns[col].name}"`)]));
      await db.insert(table).values(values).onConflictDoUpdate({ target: labelColumn, set });
    } else {
      await db.insert(table).values(values).onConflictDoNothing();
    }

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
type RoleInsert = InferInsertModel<typeof schema.role>;
type PermissionInsert = InferInsertModel<typeof schema.permission>;
type RolePermissionInsert = InferInsertModel<typeof schema.rolePermissions>;

async function seedRolesAndPermissions() {
  const baseRoles: RoleInsert[] = [
    { slug: 'admin', description: 'Full system administrator' },
    { slug: 'organizer', description: 'Manages event logistics and users' },
    { slug: 'volunteer', description: 'Supports event operations' },
    {
      slug: 'marketing',
      description: 'Writes and sends marketing email campaigns',
    },
  ];

  const basePermissions: PermissionInsert[] = [
    { slug: 'user:read:all', description: 'View any user information' },
    { slug: 'user:write:all', description: 'Modify any user information' },
    {
      slug: 'user:all:all',
      description: 'Full user management (create/update/delete)',
    },
    {
      slug: 'user:purge:all',
      description: 'Fully wipe a user account on a compliance request',
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
    { slug: 'event:manage:all', description: 'Create and manage events' },
    {
      slug: 'team:read:all',
      description: 'View all formed teams for an event',
    },
    {
      slug: 'team:manage:all',
      description: 'Remove any team member (moderation override)',
    },
    { slug: 'checkin:write:all', description: 'Check participants in or out' },
    {
      slug: 'checkin:override:all',
      description: 'Check in to schedule entries outside their scheduled time',
    },
    {
      slug: 'dietary:read:all',
      description: "View an event's dietary report",
    },
    {
      slug: 'rsvp:read:all',
      description: "View an event's RSVP waves and responses",
    },
    {
      slug: 'rsvp:write:all',
      description: "Override a participant's RSVP response",
    },
    { slug: 'application:read:all', description: 'View event applications' },
    {
      slug: 'application:review:all',
      description: 'Approve or reject applications',
    },
    {
      slug: 'application:stats:all',
      description: 'View aggregate application statistics',
    },
    {
      slug: 'application:vote:all',
      description: 'Vote yes/no on applications in the blind swipe review',
    },
    {
      slug: 'article:read:all',
      description: 'View unpublished event wiki articles',
    },
    {
      slug: 'article:write:all',
      description: 'Create, edit, publish and delete event wiki articles',
    },
    {
      slug: 'submission:read:all',
      description: 'View every project submission for an event, drafts included',
    },
    {
      slug: 'submission:delete:all',
      description: 'Delete any project submission (moderation, takedown requests)',
    },
    {
      slug: 'judging:manage:all',
      description: 'Manage expo judging criteria, weights, table layout and the judge roster, and deactivate projects',
    },
    {
      slug: 'judging:results:all',
      description: 'View live expo judging rankings',
    },
    {
      slug: 'judging:award:all',
      description: 'Record overall placements',
    },
    {
      slug: 'judging:signin:all',
      description: 'Generate a QR code that signs a judge in to their account',
    },
    {
      slug: 'display:manage:all',
      description: 'Configure the lobby displays (clock, theme)',
    },
    {
      slug: 'onboarding:skip:event',
      description: 'Skip the featured-event application step during onboarding (staff)',
    },
    {
      slug: 'audit:read:all',
      description: 'View the audit log of administrative activity',
    },
    {
      slug: 'campaign:read:all',
      description: 'View email campaigns and their results',
    },
    {
      slug: 'campaign:write:all',
      description: 'Create and edit campaign drafts and saved audiences',
    },
    {
      slug: 'campaign:send:all',
      description: 'Send or schedule email campaigns',
    },
    {
      slug: 'campaign:operational:all',
      description: "Send operational (non-marketing) email to an event's participants",
    },
    {
      slug: 'system:read:all',
      description: 'View system health and diagnostics',
    },
  ];

  console.log('🧱 Seeding roles and permissions...');

  // Roles and permissions are keyed by their unique, human-chosen `slug` —
  // that's the stable id the script uses to upsert (insert new slugs, update
  // the description of existing ones) instead of wiping the tables. Deleting
  // and reinserting with fresh serial ids — as this used to do — cascades
  // through role_permission/user_role/user_permission via their FKs and
  // silently strips every role assignment (e.g. who is an admin) on every
  // deploy. A static seed must never delete rows that user/runtime data can
  // reference.
  const result = await db.transaction(async (tx) => {
    const insertedRoles = await tx
      .insert(schema.role)
      .values(baseRoles)
      .onConflictDoUpdate({
        target: schema.role.slug,
        set: { description: sql`excluded.description` },
      })
      .returning();
    const insertedPerms = await tx
      .insert(schema.permission)
      .values(basePermissions)
      .onConflictDoUpdate({
        target: schema.permission.slug,
        set: { description: sql`excluded.description` },
      })
      .returning();

    const findPerm = (slug: string) => insertedPerms.find((p) => p.slug === slug)!;
    const findRole = (slug: string) => insertedRoles.find((r) => r.slug === slug)!;

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
        permissionId: findPerm('application:stats:all').id,
      },
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('application:vote:all').id,
      },
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('checkin:write:all').id,
      },
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('checkin:override:all').id,
      },
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('rsvp:read:all').id,
      },
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('rsvp:write:all').id,
      },
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('team:read:all').id,
      },
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('team:manage:all').id,
      },
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('article:read:all').id,
      },
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('article:write:all').id,
      },
      ...['campaign:read:all', 'campaign:write:all', 'campaign:send:all', 'campaign:operational:all'].map((slug) => ({
        roleId: findRole('organizer').id,
        permissionId: findPerm(slug).id,
      })),
      // Marketing writes and sends campaigns and reads aggregate stats only:
      // no event settings, applicant answers or operational email.
      ...['campaign:read:all', 'campaign:write:all', 'campaign:send:all', 'application:stats:all'].map((slug) => ({
        roleId: findRole('marketing').id,
        permissionId: findPerm(slug).id,
      })),
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('submission:read:all').id,
      },
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('submission:delete:all').id,
      },
      ...(['judging:manage:all', 'judging:results:all', 'judging:award:all'] as const).map((slug) => ({
        roleId: findRole('organizer').id,
        permissionId: findPerm(slug).id,
      })),
      {
        roleId: findRole('organizer').id,
        permissionId: findPerm('display:manage:all').id,
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
        roleId: findRole('volunteer').id,
        permissionId: findPerm('dietary:read:all').id,
      },
      // Staff aren't applicants: let them past the featured-event step.
      ...(['organizer', 'volunteer'] as const).map((slug) => ({
        roleId: findRole(slug).id,
        permissionId: findPerm('onboarding:skip:event').id,
      })),
    ];

    // Additive only: grant base permissions that are missing, but never
    // revoke a link — an admin may have deliberately customized a role's
    // permissions at runtime via the roles UI, and a deploy shouldn't undo it.
    await tx
      .insert(schema.rolePermissions)
      .values(rolePerms)
      .onConflictDoNothing({
        target: [schema.rolePermissions.roleId, schema.rolePermissions.permissionId],
      });

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
