# Essential Skills & Tools

A concise list of the skills and tools a developer needs to contribute independently and effectively to this codebase.

## Languages & Frameworks

- **TypeScript** — all code uses TypeScript with strict mode
- **React 19** — functional components, hooks, controlled forms
- **Next.js 15 (App Router)** — file-based routing, Server Components, Client Components, Server Actions, middleware

## Database

- **PostgreSQL** — SQL queries, joins, foreign keys, constraints
- **Drizzle ORM** — type-safe schema definitions, query builder, migration workflow (`drizzle-kit generate` → `drizzle-kit migrate`)

## Authentication & Authorization

- **Better Auth** — session-based auth (sign-up, sign-in, session validation)
- Role/permission model via custom `authz` schema

## UI & Styling

- **Tailwind CSS** — utility-first CSS
- **Radix UI / shadcn/ui** — accessible headless component primitives
- **React Hook Form + Zod** — form state management and schema validation

## Testing

- **Vitest** — unit and integration tests (`describe` / `it` / `expect`)
- **testcontainers** — spins up a real PostgreSQL container for integration tests

## Tooling

- **pnpm** — package manager
- **Docker** — runs local PostgreSQL containers
- **ESLint + Prettier** — enforced code style (checked in CI)
- **Git** — version control
