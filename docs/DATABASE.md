# Database Configuration

This guide explains how database configuration works in the MRUHacks 2026 platform.

If you need help setting up the database, you should first review [SETUP.md](./SETUP.md).

## Configuration

The application supports two methods for configuring the database connection:

### Method 1: Direct Connection String

Set a complete PostgreSQL connection URL:

```env
DATABASE_URL=postgres://user:password@host:port/database
```

### Method 2: Individual Variables

Provide individual connection parameters:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=your_database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```

The application will construct the connection URL automatically:

```
postgres://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}
```

## Connection URL Construction

The `getDatabaseURL()` function in `src/utils/db.ts` handles the configuration logic:

1. **XOR Logic**: Use the method that is defined
   - If only `DATABASE_URL` is set -> use it
   - If only individual variables are set -> construct URL from them
2. **Equality Check**: Both methods can be set if they're equal
   - If both are set and produce the same URL -> use it
3. **Conflict Detection**: Throws an error if both are set but differ
4. **Missing Configuration**: Throws an error if neither method is configured

## Local Development Database

Run the Docker containers for the Databases via the command:

```bash
pnpm run db:start
```

This boots the `db-dev` (`mruhacks-db-dev`) and `db-test` (`mruhacks-db-test`) PostgreSQL 17 containers defined in `docker-compose.yml`. By default use the ports:

- `db-dev` ->`localhost:5432`
- `db-test` -> `localhost:5433`

The defaults in `.env.example` (`POSTGRES_*` and `TEST_POSTGRES_*`) already match these containers.

Additional scripts:

- `pnpm run db:stop` — stop the containers
- `pnpm run db:reset` — drop volumes, recreate the containers, wait for readiness, run migrations, and seed baseline data

> Prefer `pnpm run db:start`, but you can also run `docker compose up -d db-dev` (or `db-test`) directly when you only need one of the services.

## Drizzle Configuration

You probably won't have to worry about changing these, but you can view the database connection settings in `drizzle.config.ts`:

```typescript
export default defineConfig({
  out: "./drizzle", // Migration files directory
  schema: "./src/db/schema.ts", // Schema definition
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseURL(), // Logic mentioned above
  },
  migrations: {
    table: "journal", // Migration tracking table
    schema: "drizzle", // Schema for migration table
  },
});
```

## Migrations

### Generate Migrations

The command below creates SQL migration files in the `drizzle/` directory:

```bash
pnpm drizzle-kit generate
```

In order to update the database, we must actually apply the migrations using the following command:

```bash
pnpm drizzle-kit migrate
```

You may see reference online to another command `drizzle-kit push`, while this command can be nice for dev, it requires a different flow that is not described in this documentation. Please do not use `drizzle-kit push` for migrations.

## Database Schema Files

Our database schema is split across multiple files to be more manageable.

- `src/db/schema.ts`: Main export file
- `src/db/auth-schema.ts`: Defines authentication (who you are) related tables.
- `src/db/lookups.ts`: Defines reference/lookup tables.
- `src/db/events-and-participation.ts`: Defines events (with `parent_event_id`, `capacity`), user profiles, event applications (with `id`, `status_id`, `reviewed_at`, `reviewed_by`, `waitlist_position`), event RSVP waves and responses, user interests/dietary (user-level), event attendees, groups, group members, submissions, and application views
- `src/db/authz.ts`: Defines authorization (what you can do) related tables.
- `src/db/enums.ts`: Defines valid values for the tables defined in `lookups.ts` (including `application_statuses`, `rsvp_statuses`), and seeds those values into the tables.

## Schema diagram

The following diagram shows all tables and their relationships. Auth tables live in `public`; authorization tables live in the `authz` schema.

```mermaid
erDiagram
    user ||--o{ session : "has"
    user ||--o{ account : "has"
    user ||--o| user_profiles : "has"
    user ||--o{ event_applications : "submits"
    user ||--o{ event_attendees : "registers"
    user ||--o{ event_rsvp_responses : "responds"
    user ||--o{ user_interests : "has"
    user ||--o{ user_dietary_restrictions : "has"
    user ||--o{ group_members : "in"
    user ||--o{ authz_user_role : "has"
    user ||--o{ authz_user_permission : "has"

    events ||--o{ events : "parent_of"
    events ||--o{ event_applications : "receives"
    events ||--o{ event_attendees : "hosts"
    events ||--o{ event_rsvp_waves : "has"
    events ||--o{ groups : "hosts"
    events ||--o{ submissions : "receives"

    event_rsvp_waves ||--o{ event_rsvp_responses : "has"

    application_statuses ||--o{ event_applications : "referenced_by"
    rsvp_statuses ||--o{ event_rsvp_responses : "referenced_by"

    groups ||--o{ group_members : "contains"
    groups ||--o{ submissions : "makes"

    genders ||--o{ user_profiles : "referenced_by"
    universities ||--o{ user_profiles : "referenced_by"
    majors ||--o{ user_profiles : "referenced_by"
    years_of_study ||--o{ user_profiles : "referenced_by"
    interests ||--o{ user_interests : "referenced_by"
    dietary_restrictions ||--o{ user_dietary_restrictions : "referenced_by"

    authz_role ||--o{ authz_user_role : "assigned_to"
    authz_permission ||--o{ authz_user_permission : "assigned_to"
    authz_role ||--o{ authz_role_permission : "has"
    authz_permission ||--o{ authz_role_permission : "assigned_to"

    user {
        uuid id PK
        text name
        text email
        boolean email_verified
        text image
        timestamp created_at
        timestamp updated_at
    }

    session {
        uuid id PK
        text token UK
        timestamp expires_at
        uuid user_id FK
    }

    account {
        uuid id PK
        uuid user_id FK
        text provider_id
    }

    verification {
        uuid id PK
        text identifier
        text value
        timestamp expires_at
    }

    events {
        uuid id PK
        uuid parent_event_id FK "nullable"
        text name
        boolean has_application
        jsonb application_questions
        timestamp starts_at
        timestamp ends_at
        int capacity "nullable"
        timestamp created_at
        timestamp updated_at
    }

    user_profiles {
        uuid user_id PK, FK
        varchar full_name
        int gender_id FK
        int university_id FK
        int major_id FK
        int year_of_study_id FK
    }

    event_applications {
        uuid id PK
        uuid event_id FK
        uuid user_id FK
        int status_id FK "nullable"
        timestamp reviewed_at "nullable"
        uuid reviewed_by FK "nullable"
        int waitlist_position "nullable"
        jsonb responses
        timestamp created_at
        timestamp updated_at
    }

    event_rsvp_waves {
        uuid id PK
        uuid event_id FK
        smallint wave
        timestamp respond_by "nullable"
        timestamp created_at
    }

    event_rsvp_responses {
        uuid id PK
        uuid rsvp_wave_id FK
        uuid user_id FK
        int status_id FK "nullable"
        timestamp responded_at "nullable"
        timestamp created_at
        timestamp updated_at
    }

    user_interests {
        uuid user_id FK
        int interest_id FK
    }

    user_dietary_restrictions {
        uuid user_id FK
        int restriction_id FK
    }

    event_attendees {
        uuid event_id PK, FK
        uuid user_id PK, FK
        timestamp registered_at
    }

    groups {
        uuid id PK
        uuid event_id FK
        text name
        timestamp created_at
        timestamp updated_at
    }

    group_members {
        uuid group_id PK, FK
        uuid user_id PK, FK
    }

    submissions {
        uuid id PK
        uuid group_id FK
        uuid event_id FK
        timestamp submitted_at
    }

    genders {
        serial id PK
        varchar label
    }

    universities {
        serial id PK
        varchar label
    }

    majors {
        serial id PK
        varchar label
    }

    years_of_study {
        serial id PK
        varchar label
    }

    interests {
        serial id PK
        varchar label
    }

    dietary_restrictions {
        serial id PK
        varchar label
    }

    heard_from_sources {
        serial id PK
        varchar label
    }

    application_statuses {
        serial id PK
        varchar label
    }

    rsvp_statuses {
        serial id PK
        varchar label
    }

    authz_permission {
        serial id PK
        text slug
        text description
    }

    authz_role {
        serial id PK
        text slug
        text description
    }

    authz_user_role {
        uuid user_id PK, FK
        int role_id PK, FK
    }

    authz_user_permission {
        uuid user_id PK, FK
        int permission_id PK, FK
    }

    authz_role_permission {
        int role_id PK, FK
        int permission_id PK, FK
    }
```

**Notes:**

- The diagram shows **base tables** only. Entities prefixed with `authz_` (e.g. `authz_permission`, `authz_role`, `authz_user_role`) are in the `authz` schema; all others are in `public`.
- The database also has two **views** (not shown): `application_view` and `application_form_view`. They are denormalized views over `event_applications`, `user_profiles`, and lookup tables. See [ARCHITECTURE.md](./ARCHITECTURE.md) under "Database Views" for details.
- The `heard_from_sources` lookup table has no foreign keys from other tables in the current schema.
- `application_statuses` (labels: pending_review, approved, denied, waitlisted) is referenced by `event_applications.status_id`. `rsvp_statuses` (labels: pending, accepted, declined, timed_out) is referenced by `event_rsvp_responses.status_id`.

## Drizzle Studio

Drizzle Studio gives a visual interface for:

- Viewing tables and data
- Running queries
- Editing records
- Exploring relationships:

DO NOT USE IT TO UPDATE THE SCHEMA.

```bash
pnpm drizzle-kit studio
```

Opens at `https://local.drizzle.studio`

## Troubleshooting

### Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:** Ensure PostgreSQL is running:

```bash
docker ps | grep mruhacks-db-dev
```

If not running, start it with `pnpm run db:start`.

### Invalid Connection String

```
Error: Invalid connection string
```

**Solution:** Check your `DATABASE_URL` format:

- Must start with `postgres://` or `postgresql://`
- Format: `postgres://user:password@host:port/database`

### Conflicting URLs

```
Error: Conflicting database URLs detected
```

**Solution:** You have both `DATABASE_URL` and individual variables set, but they don't match. Choose one method:

- Remove `DATABASE_URL`, or
- Remove individual `POSTGRES_*` variables

### No Configuration Found

```
Error: No database configuration found
```

**Solution:** Set either:

- `DATABASE_URL`, or
- All required `POSTGRES_*` variables (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`)
