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
  out: "./drizzle",              // Migration files directory
  schema: "./src/db/schema.ts",  // Schema definition
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseURL(),       // Logic mentioned above
  },
  migrations: {
    table: "journal",            // Migration tracking table
    schema: "drizzle",           // Schema for migration table
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
- `src/db/registrations.ts`: Defines participant registration tables and views
- `src/db/authz.ts`:  Defines authorization (what you can do) related tables.
- `src/db/enums.ts`: Defines valid values for the tables defined in `lookups.ts`, it then seeds those values into the tables.

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
