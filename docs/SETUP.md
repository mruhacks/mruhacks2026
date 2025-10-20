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

For local development, use the provided `localdb.sh` script to spin up a PostgreSQL database in Docker:

```bash
./localdb.sh
```

This script will:
- Stop and remove any existing `mruhacks-postgres` container
- Start a new PostgreSQL 17 container on port 5432
- Output the `DATABASE_URL` for your `.env` file

Copy the `DATABASE_URL` output by the script into your `.env` file (or `.env.local`).

### 3. Configure Environment Variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` and configure:

```env
# Database connection (use output from localdb.sh)
DATABASE_URL=postgres://postgres:g61Veraq1DssIKfsEk5zEzuwJTdozJHwHrQiOBCd@localhost:5432/postgres

# Better Auth
BETTER_AUTH_SECRET=your_secret_key_here
BETTER_AUTH_URL=http://localhost:3000
```

**Alternative Database Configuration:**

Instead of `DATABASE_URL`, you can use individual variables:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=your_database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```

The application will construct the connection URL automatically. See [Database Configuration](./DATABASE.md) for details.

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
2. Check if the PostgreSQL container is running: `docker ps | grep mruhacks-postgres`
3. Verify the `DATABASE_URL` in your `.env` file matches the output from `localdb.sh`

### Migration Errors

If migrations fail:

1. Check your database schema in `src/db/schema.ts`
2. Ensure the database is running
3. Try resetting the database: `./localdb.sh` (warning: this deletes all data)

### Port Already in Use

If port 5432 is already in use:

1. Stop the existing PostgreSQL service
2. Or modify `localdb.sh` to use a different port (e.g., `-p 5433:5432`)

## Next Steps

- Read the [Architecture Guide](./ARCHITECTURE.md)
- See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines
- Learn about [Database Configuration](./DATABASE.md)
