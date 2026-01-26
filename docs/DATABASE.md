# Database Configuration

This guide explains how database configuration works in the MRU Hacks 2026 platform.

## Configuration Methods

The application supports two methods for configuring the database connection:

### Method 1: Direct Connection String

Set a complete PostgreSQL connection URL:

```env
DATABASE_URL=postgres://user:password@host:port/database
```

Example:
```env
DATABASE_URL=postgres://postgres:g61Veraq1DssIKfsEk5zEzuwJTdozJHwHrQiOBCd@localhost:5432/postgres
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

## Configuration Logic

The `getDatabaseURL()` function in `src/utils/db.ts` handles the configuration logic:

1. **XOR Logic**: Exactly one method must be defined
   - If only `DATABASE_URL` is set → use it
   - If only individual variables are set → construct URL from them
   
2. **Equality Check**: Both methods can be set if they're equal
   - If both are set and produce the same URL → use it
   
3. **Conflict Detection**: Throws an error if both are set but differ
   - Prevents accidental misconfiguration
   
4. **Missing Configuration**: Throws an error if neither method is configured

## Local Development Database

Run the Docker Compose stack via the npm helper script:

```bash
npm run db:start
```

This boots the `db-dev` (`mruhacks-db-dev`) and `db-test` (`mruhacks-db-test`) PostgreSQL 17 containers defined in `docker-compose.yml`. By default they bind to:

- `db-dev` → `localhost:5432`
- `db-test` → `localhost:5433`

The defaults in `.env.example` (`POSTGRES_*` and `TEST_POSTGRES_*`) already match these containers. Override any value in `.env` if you need a different port, password, or database name.

Additional scripts:

- `npm run db:stop` — stop the containers
- `npm run db:reset` — drop volumes, recreate the containers, wait for readiness, run migrations, and seed baseline data

Prefer the npm scripts, but you can also call Docker Compose directly (e.g., `docker compose up -d db-dev`) when you only require one of the databases.

## Production Configuration

For production:

1. **Never reuse the example/local credentials** — generate unique secrets and passwords
2. Provide connection info via `DATABASE_URL` or the individual `POSTGRES_*` variables offered by your hosting provider
3. Enable SSL in production (currently disabled, see `src/utils/db.ts`)
4. Consider using connection pooling for better performance

To enable SSL for production:

```typescript
// In src/utils/db.ts
const isProduction = process.env.NODE_ENV === "production";
```

## Drizzle Configuration

Database connection settings are configured in `drizzle.config.ts`:

```typescript
export default defineConfig({
  out: "./drizzle",              // Migration files directory
  schema: "./src/db/schema.ts",  // Schema definition
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseURL(),       // Uses the same logic
  },
  migrations: {
    table: "journal",            // Migration tracking table
    schema: "drizzle",           // Schema for migration table
  },
});
```

## Migrations

### Push Schema (Development)

For rapid development, use `push` to sync schema directly:

```bash
npx drizzle-kit push
```

This:
- Compares schema with database
- Applies changes directly
- Doesn't create migration files
- **Use only in development**

### Generate Migrations (Production)

For production, generate proper migration files:

```bash
npx drizzle-kit generate
```

This creates SQL migration files in the `drizzle/` directory.

Apply migrations:

```bash
npx drizzle-kit migrate
```

## Database Schema Files

Schema is organized across multiple files:

- `src/db/schema.ts`: Main export file
- `src/db/auth-schema.ts`: Better Auth tables
- `src/db/lookups.ts`: Reference/lookup tables
- `src/db/registrations.ts`: Participant registration tables and views

## Drizzle Studio

Browse and edit the database using Drizzle Studio:

```bash
npx drizzle-kit studio
```

Opens at `https://local.drizzle.studio` with a visual interface for:
- Viewing tables and data
- Running queries
- Editing records
- Exploring relationships

## Troubleshooting

### Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:** Ensure PostgreSQL is running:
```bash
docker ps | grep mruhacks-db-dev
```

If not running, start it with `npm run db:start`.

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

## Best Practices

1. **Use `DATABASE_URL` for simplicity** - Single variable is easier to manage
2. **Never commit `.env` files** - They're in `.gitignore` for security
3. **Use strong passwords in production** - The local dev password is intentionally weak
4. **Enable SSL in production** - Protects data in transit
5. **Use migrations in production** - Never use `drizzle-kit push` in production
6. **Backup regularly** - Especially before running migrations

## See Also

- [Setup Guide](./SETUP.md) - Getting started with local development
- [Architecture Overview](./ARCHITECTURE.md) - System architecture
