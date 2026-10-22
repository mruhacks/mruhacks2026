# MRUHacks 2026

Our very own hackathon management platform.

## 🚀 Quick Start

Requires Node.js 20+, pnpm, and Docker.

```bash
pnpm install
cp .env.example .env   # defaults work for local development
pnpm db:start          # Postgres (dev on :5432, test on :5433)
pnpm db:seed           # run migrations + seed baseline data
pnpm dev               # http://localhost:3000
```

Use `pnpm services:start` instead of `db:start` to also run Mailhog, which
catches outgoing email at [http://localhost:8025](http://localhost:8025). See
the [Setup Guide](./docs/SETUP.md) for details and troubleshooting.

### Useful scripts

| Command                           | What it does                                               |
| --------------------------------- | ---------------------------------------------------------- |
| `pnpm test`                       | Run the Vitest suite                                       |
| `pnpm lint` / `pnpm format:check` | ESLint / Prettier checks (both run in CI)                  |
| `pnpm knip`                       | Find unused files, exports, and dependencies               |
| `pnpm db:reset`                   | Drop the database volumes, re-migrate, and re-seed         |
| `pnpm db:seed:judging`            | Seed sample data for expo judging                          |
| `pnpm check-health`               | Hit the health endpoint to check env vars and integrations |

## 📚 Documentation

- **[Setup Guide](./docs/SETUP.md)** - Detailed setup instructions
- **[Architecture](./docs/ARCHITECTURE.md)** - Project structure, glossary, and
  design patterns
- **[Database Guide](./docs/DATABASE.md)** - Database configuration, migrations,
  and Drizzle commands
- **[Cloud Agent Setup](./docs/CLOUD_AGENT_SETUP.md)** - Getting the app, tests
  and a logged-in browser running in a sandboxed AI-agent container
- **[Contributing](./CONTRIBUTING.md)** - Development guidelines and best
  practices
- **[AGENTS.md](./AGENTS.md)** - Project-wide rules (permissions, datetimes,
  form errors, health checks) for humans and AI agents alike

## 🔑 Key Features

**For participants**

- Sign in with a magic link, email/password, or GitHub/Google (Cloudflare
  Turnstile protected)
- Apply to events with an application, or one-click register for events without
  one
- RSVP to invitations, and carry a QR ticket in Apple Wallet or Google Wallet
- Form teams, submit projects, and read the event wiki

**For organizers**

- Per-event dashboard: application review, RSVP waves, stats, custom questions,
  wiki articles, and settings
- Check-in for the main event and sub-events (meals, workshops), plus dietary
  reports
- Expo judging with judge QR sign-in and Crowd-BT rankings (ported from Gavel)
- Email campaigns with query-built audiences
- Live display screens and printable table signs
- User, role, and permission management with an audit log viewer

## 🏗️ Tech Stack

- **Framework**: Next.js 16 (React 19, App Router)
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Better Auth, with permission-based RBAC
- **Styling**: Tailwind CSS 4 + Radix UI (shadcn/ui)
- **Forms**: React Hook Form + Zod
- **Testing**: Vitest
- **Hosting**: Vercel (queues, analytics), with cron jobs triggered from
  Cloudflare
- **Language**: TypeScript

## 📄 License

[AGPL-3.0-only](./LICENSE)
