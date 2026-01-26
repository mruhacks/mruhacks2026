# Setup Guide
The intention of this guide is to help you through setup of your local development environment. If you would like greater context on the different aspects of the application we are setting up, refer to the relevent files in the `docs/` folder. 

## Prerequisites

- Node.js 20+
- Docker
- pnpm

## Installation Steps

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/Kapocsi/mruhacks2026.git
cd mruhacks2026
pnpm install
```

### 2. Set Up Local Database
Ensure the docker desktop application is running, then start run the following script to start the docker container which our database runs inside.  

```bash
pnpm run db:start
```

This command:
- Starts the `db-dev` and `db-test` database containers defined in `docker-compose.yml`
- Maps `db-dev` to port `5432` and `db-test` to `5433` (override via `POSTGRES_PORT` / `TEST_POSTGRES_PORT`)
- Waits for the dev database to be healthy before returning


When you are done developing, stop the containers with `pnpm run db:stop`. Use `pnpm run db:reset` to drop volumes, recreate the containers, run migrations, and seed baseline data.

### 3. Configure Environment Variables

Copy `.env.example` to `.env`.

```bash
cp .env.example .env
```

For local development, we do not need to change any of these values.

### 4. Run Database Migrations

Apply all database migrations using:

```bash
pnpm drizzle-kit migrate 
```

### 5. Seed the Database 

Populate the database with sample data:

```bash
pnpm tsx scripts/seed.ts
```

This will seed lookup tables (genders, universities, majors, etc.) with initial data.

### 6. Start Development Server

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.


## Troubleshooting

### Database Connection Issues

If you get connection errors:

1. Verify Docker is running: `docker ps`
2. Check if the dev container is running: `docker ps | grep mruhacks-db-dev`
3. Ensure your `.env` `POSTGRES_*` values match the ports and credentials configured in `docker-compose.yml`
4. Restart the stack: `pnpm run db:stop && pnpm run db:start`

### Migration Errors

If migrations fail:

1. Check your database schema in `src/db/schema.ts`
2. Ensure the database is running
3. Run `pnpm run db:reset` to drop volumes, recreate the database, re-run migrations, and seed baseline data (warning: this deletes all data)

### Port Already in Use

If port 5432 is already in use:

You may have another instance of PostgreSQL running. Use the Docker Desktop app to see if other containers are running. If any are running pause/stop them and try again.

## Next Steps

- Read the [Architecture Guide](./ARCHITECTURE.md)
- See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines
- Learn about [Database Configuration](./DATABASE.md)
