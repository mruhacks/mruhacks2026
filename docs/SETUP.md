# Setup Guide

This guide will help you set up the MRU Hacks 2026 platform for local development.

## Prerequisites

- Node.js 20+ or Bun
- Docker (for local database)
- npm, yarn, pnpm, or bun

## Installation Steps

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/Kapocsi/mruhacks2026.git
cd mruhacks2026
npm install
```

### 2. Set Up Local Database

Run the Docker Compose stack via the provided npm script:

```bash
npm run db:start
```

This command:
- Starts the `db-dev` and `db-test` PostgreSQL 17 containers defined in `docker-compose.yml`
- Maps dev to port `5432` and test to `5433` (override via `POSTGRES_PORT` / `TEST_POSTGRES_PORT`)
- Waits for the dev database to be healthy before returning

> Prefer `npm run db:start`, but you can also run `docker compose up -d db-dev` (or `db-test`) directly when you only need one of the services.

When you are done developing, stop the containers with `npm run db:stop`. Use `npm run db:reset` to drop volumes, recreate the containers, run migrations, and seed baseline data.

### 3. Configure Environment Variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` and configure the secrets + database credentials (example values shown):

```env
# Better Auth
BETTER_AUTH_SECRET=your_secret_key_here
BETTER_AUTH_URL=http://localhost:3000

# Local dev database (matches docker-compose defaults)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=mruhacks_dev
POSTGRES_PORT=5432

# Optional: local test database config
TEST_POSTGRES_DB=mruhacks_test
TEST_POSTGRES_PORT=5433
```

The app builds the `DATABASE_URL` automatically from the `POSTGRES_*` values. If you prefer a single variable, you can still define `DATABASE_URL=postgres://...` and omit the individual parts—just avoid setting both to conflicting values. See [Database Configuration](./DATABASE.md) for full details.

### 4. Run Database Migrations

Apply all database migrations using Drizzle Kit:

```bash
npx drizzle-kit push
```

This command:
- Reads the schema from `src/db/schema.ts`
- Compares it with the current database state
- Applies necessary changes to sync the database

**Note:** In development, `drizzle-kit push` is the easiest way to sync your schema. For production, use proper migration files.

### 5. Seed the Database (Optional)

Populate the database with sample data:

```bash
npx tsx scripts/seed.ts
```

This will seed lookup tables (genders, universities, majors, etc.) with initial data.

### 6. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Common Drizzle Commands

### View Current Database Schema

```bash
npx drizzle-kit introspect
```

### Generate Migration Files

```bash
npx drizzle-kit generate
```

### Apply Migrations

```bash
npx drizzle-kit migrate
```

### Open Drizzle Studio (Database Browser)

```bash
npx drizzle-kit studio
```

This opens a web interface at `https://local.drizzle.studio` to browse and edit your database.

## Troubleshooting

### Database Connection Issues

If you get connection errors:

1. Verify Docker is running: `docker ps`
2. Check if the dev container is running: `docker ps | grep mruhacks-db-dev`
3. Ensure your `.env` `POSTGRES_*` values match the ports and credentials configured in `docker-compose.yml`
4. Restart the stack: `npm run db:stop && npm run db:start`

### Migration Errors

If migrations fail:

1. Check your database schema in `src/db/schema.ts`
2. Ensure the database is running
3. Run `npm run db:reset` to drop volumes, recreate the database, re-run migrations, and seed baseline data (warning: this deletes all data)

### Port Already in Use

If port 5432 is already in use:

1. Stop the existing PostgreSQL service
2. Override `POSTGRES_PORT` (and/or `TEST_POSTGRES_PORT`) in your `.env` or adjust `docker-compose.yml` to use a different host port (e.g., `5433:5432`)

## Next Steps

- Read the [Architecture Guide](./ARCHITECTURE.md)
- See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines
- Learn about [Database Configuration](./DATABASE.md)
