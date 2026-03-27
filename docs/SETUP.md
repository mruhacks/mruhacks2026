# Setup Guide

The intention of this guide is to help you through setup of your local development environment. If you would like greater context on the different aspects of the application we are setting up, refer to the relevant files in the `docs/` folder.

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

This command runs `docker compose up -d`, which starts every service in `docker-compose.yml`:

- **`db-dev`** and **`db-test`**: PostgreSQL for development and tests (`localhost:5432` and `localhost:5433` by default; override via `POSTGRES_PORT` / `TEST_POSTGRES_PORT`)
- **`mailhog`**: fake SMTP for local email (SMTP `localhost:1025`, web UI [http://localhost:8025](http://localhost:8025))

Verification and password-reset emails are delivered to MailHog only when this stack is running.

When you are done developing, stop the containers with `pnpm run db:stop`. Use `pnpm run db:reset` to drop volumes, recreate the containers, run migrations, and seed baseline data.

### 3. Configure Environment Variables

Copy `.env.example` to `.env`.

```bash
cp .env.example .env
```

The example values work for a typical setup: app at [http://localhost:3000](http://localhost:3000), Postgres from Docker, and MailHog for mail. If you run the dev server on another **origin** (different scheme, host, or port), update **`BETTER_AUTH_URL`** and **`NEXT_PUBLIC_BETTER_AUTH_URL`** to match—Better Auth uses them to build links inside verification and password-reset emails.

#### Better Auth and secrets

- **`BETTER_AUTH_SECRET`** (or **`AUTH_SECRET`**): signing secret for sessions; required.
- **`BETTER_AUTH_URL`**: public origin of the app (e.g. `http://localhost:3000`). Must match how you open the site in the browser.
- **`NEXT_PUBLIC_BETTER_AUTH_URL`**: same origin as `BETTER_AUTH_URL` when the UI and API share one host (typical Next.js). The client uses it for auth requests.

#### SMTP (local: MailHog)

Local development sends mail through the MailHog container:

- **`SMTP_HOST`** / **`SMTP_PORT`**: e.g. `localhost` and `1025` (see `.env.example`).
- **`SMTP_USER`** / **`SMTP_PASSWORD`**: leave empty for MailHog (no SMTP auth).
- **`EMAIL_FROM`**: display name and address shown on outgoing mail.

Open [http://localhost:8025](http://localhost:8025) after sign-up or “forgot password” to read messages. For production, point these variables at a real SMTP provider instead.

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

### No email in MailHog

If verification or reset messages never appear:

1. Confirm MailHog is running: `docker ps | grep mruhacks-mailhog` (or run `pnpm run db:start`).
2. Check `SMTP_HOST`, `SMTP_PORT`, and firewall rules match your `.env`.
3. Ensure **`BETTER_AUTH_URL`** matches the URL you use in the browser (wrong origin produces broken links and confusing behavior).

## Next Steps

- Read the [Architecture Guide](./ARCHITECTURE.md) (authentication, proxy, and `requireVerifiedUser` behavior)
- See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines
- Learn about [Database Configuration](./DATABASE.md)
