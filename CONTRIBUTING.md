# Contributing to MRUHacks 2026

This document lists the essential skills and tools a developer should know to contribute independently and effectively to this codebase.

---

## Table of Contents

- [Essential Tools](#essential-tools)
- [Essential Skills](#essential-skills)
  - [TypeScript](#typescript)
  - [React & Next.js App Router](#react--nextjs-app-router)
  - [Drizzle ORM & PostgreSQL](#drizzle-orm--postgresql)
  - [Authentication with Better Auth](#authentication-with-better-auth)
  - [Styling: Tailwind CSS & Radix UI](#styling-tailwind-css--radix-ui)
  - [Forms: React Hook Form & Zod](#forms-react-hook-form--zod)
  - [Testing with Vitest](#testing-with-vitest)
- [Codebase-Specific Patterns](#codebase-specific-patterns)
- [Development Workflow](#development-workflow)
- [Learning Resources](#learning-resources)

---

## Essential Tools

These tools must be installed and understood before you can run the project locally:

| Tool | Version | Purpose |
|------|---------|---------|
| [Node.js](https://nodejs.org/) | 20+ | JavaScript runtime |
| [pnpm](https://pnpm.io/) | Latest | Package manager (replaces npm/yarn) |
| [Docker](https://www.docker.com/) | Latest | Runs the local PostgreSQL database containers |
| [Git](https://git-scm.com/) | Latest | Version control |

**Recommended editor:** [VS Code](https://code.visualstudio.com/) — the repository includes recommended extensions in `.vscode/`.

---

## Essential Skills

### TypeScript

All code in this project is written in **TypeScript with strict mode enabled**. You should be comfortable with:

- Basic types, interfaces, and type aliases
- Generics (e.g., `ActionResult<T>`)
- Type narrowing (e.g., `if (result.success)` narrows the discriminated union)
- Utility types (`Partial`, `Pick`, `Omit`, etc.)
- Module imports/exports with ES module syntax

The TypeScript configuration lives in `tsconfig.json`. The path alias `@/*` maps to `./src/*` so you can import with `@/components/...` instead of relative paths.

> **Resources:** [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) | [TypeScript in 5 minutes](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html)

---

### React & Next.js App Router

The frontend uses **React 19** and **Next.js 15 with the App Router**. Key concepts you need:

**React**
- Functional components and hooks (`useState`, `useEffect`, `useRef`, etc.)
- Custom hooks (see `src/hooks/`)
- Controlled vs uncontrolled inputs

**Next.js App Router**
- **File-based routing**: files in `src/app/` define routes. Folders wrapped in `(parentheses)` are route groups (no URL segment); folders wrapped in `[brackets]` are dynamic segments.
- **Server Components vs Client Components**: components are Server Components by default. Add `"use client"` at the top of a file to make it a Client Component. Prefer Server Components for data fetching; use Client Components for interactivity.
- **Server Actions**: functions marked `"use server"` run on the server and can be called directly from client components. See the `ActionResult` pattern below.
- **Layouts and nested layouts**: `layout.tsx` files wrap all child routes.
- **Middleware**: `src/middleware.ts` intercepts requests and enforces authentication for protected routes.
- **API routes**: `src/app/api/` directory contains API route handlers.

> **Resources:** [Next.js App Router docs](https://nextjs.org/docs/app) | [React docs](https://react.dev/)

---

### Drizzle ORM & PostgreSQL

Database access uses **Drizzle ORM** with **PostgreSQL 17**. You should understand:

- **SQL fundamentals**: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `JOIN`, foreign keys, unique constraints
- **Drizzle schema definitions** in `src/db/` — tables are defined with `pgTable`, columns with helpers like `uuid()`, `varchar()`, `boolean()`, `timestamp()`, etc.
- **Drizzle query builder**: `db.select().from(table).where(...)`, `db.insert(table).values(...)`, `db.update(table).set(...).where(...)`, `db.delete(table).where(...)`
- **Migrations workflow**: schema changes must go through `drizzle-kit generate` (creates SQL files) then `drizzle-kit migrate` (applies them). **Never use `drizzle-kit push`** — it bypasses the migration file workflow.
- **Drizzle Studio**: visual browser for the database at `https://local.drizzle.studio` (run `pnpm drizzle-kit studio`). Use for inspection only; do not modify schema through Studio.

The schema is split across files for maintainability:

| File | Contents |
|------|---------|
| `src/db/schema.ts` | Central export file |
| `src/db/auth-schema.ts` | Better Auth tables (users, sessions) |
| `src/db/lookups.ts` | Reference/lookup tables (genders, universities, etc.) |
| `src/db/events-and-participation.ts` | Core domain tables |
| `src/db/authz.ts` | Authorization tables (roles, permissions) |

> **Resources:** [Drizzle ORM docs](https://orm.drizzle.team/) | [PostgreSQL tutorial](https://www.postgresqltutorial.com/)

---

### Authentication with Better Auth

User authentication is handled by **Better Auth**. You should understand:

- How the auth client (`src/utils/auth.ts`) exposes sign-up, sign-in, and sign-out methods
- Sessions are checked server-side in middleware and server actions
- The `user` table is managed by Better Auth and should not be modified manually

For access control, the `src/db/authz.ts` schema provides roles and permissions that are checked server-side before performing sensitive operations.

> **Resources:** [Better Auth docs](https://www.better-auth.com/docs)

---

### Styling: Tailwind CSS & Radix UI

The UI is built with **Tailwind CSS 4** (utility-first CSS) and **Radix UI** primitives wrapped as **shadcn/ui** components:

- **Tailwind CSS**: apply styles directly in JSX as class names (`className="flex items-center gap-2 text-sm"`). The configuration is in `tailwind.config.ts`.
- **Radix UI**: unstyled, accessible headless components (dialogs, dropdowns, tooltips, etc.). These are wrapped by the shadcn/ui components in `src/components/ui/`.
- **shadcn/ui**: pre-built, copy-paste components using Radix UI + Tailwind. To add a new component run `pnpm dlx shadcn@latest add <component>`. Config is in `components.json`.
- **`clsx` and `tailwind-merge`**: combine conditional class names safely via the `cn()` utility.
- **`class-variance-authority` (CVA)**: defines variant-based styles for reusable components.

> **Resources:** [Tailwind CSS docs](https://tailwindcss.com/docs) | [Radix UI docs](https://www.radix-ui.com/) | [shadcn/ui docs](https://ui.shadcn.com/)

---

### Forms: React Hook Form & Zod

All user-input forms use **React Hook Form** for state management and **Zod** for schema-based validation:

- **Zod**: define a schema with `z.object({...})`, infer the TypeScript type with `z.infer<typeof schema>`, and use it for both client-side and server-side validation.
- **React Hook Form**: `useForm<T>()` manages form state; `register`, `handleSubmit`, `formState.errors`, and `Controller` are the key APIs.
- **`@hookform/resolvers`**: the `zodResolver(schema)` adapter connects Zod schemas to React Hook Form.
- Validation runs on both the **client** (React Hook Form) and the **server** (inside server actions) for security.

> **Resources:** [React Hook Form docs](https://react-hook-form.com/) | [Zod docs](https://zod.dev/)

---

### Testing with Vitest

Tests live in `src/tests/` and are run with **Vitest**:

- Write tests using the `describe` / `it` / `expect` API (same as Jest)
- Integration tests that need a database use **testcontainers** to spin up a real PostgreSQL container
- Run tests with `pnpm test`
- The Vitest configuration is in `vitest.config.ts` (node environment, `@/*` path alias)

> **Resources:** [Vitest docs](https://vitest.dev/) | [testcontainers-node docs](https://node.testcontainers.org/)

---

## Codebase-Specific Patterns

### ActionResult Pattern

All server actions return an `ActionResult<T>` discriminated union:

```typescript
export type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string };
```

Always check `result.success` before using `result.data`:

```typescript
const result = await someServerAction(formData);
if (result.success) {
  // result.data is available and typed
} else {
  toast.error(result.error);
}
```

### Server vs Client Components

- **Data fetching and database access** → Server Component or server action
- **User interaction, browser APIs, React hooks** → Client Component (`"use client"`)
- Pass data from Server Components to Client Components via props

### Route Protection

`src/middleware.ts` runs before every request to `/dashboard/*` and redirects unauthenticated users to `/forbidden`. When adding new protected routes, ensure they match the middleware matcher pattern.

### Database Migrations

Always follow this order when changing the schema:

1. Edit schema files in `src/db/`
2. `pnpm drizzle-kit generate` — creates SQL migration files in `drizzle/`
3. `pnpm drizzle-kit migrate` — applies migrations to the running database
4. Commit both schema changes and generated migration files together

### Terminology

Use consistent terminology across code, UI, and docs (see [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full glossary):

- **Sign up** / **Sign in** — not "register" for account creation
- **Apply to an event** — for events with `has_application: true`
- **Register for an event** — for events without an application (one-click signup)
- **Group** — a team within an event; not "team"
- **Submission** — a group's project submission; not "application"

---

## Development Workflow

```bash
# 1. Install dependencies
pnpm install

# 2. Start local database (requires Docker)
pnpm run db:start

# 3. Copy environment variables
cp .env.example .env

# 4. Run migrations
pnpm drizzle-kit migrate

# 5. Seed the database
pnpm tsx scripts/seed.ts

# 6. Start the development server
pnpm run dev
```

Before opening a pull request, ensure these all pass:

```bash
pnpm lint          # ESLint checks
pnpm format:check  # Prettier formatting
pnpm test          # Vitest tests
```

To auto-fix formatting issues: `pnpm format`

See [SETUP.md](./docs/SETUP.md) for detailed setup instructions and troubleshooting.

---

## Learning Resources

| Topic | Link |
|-------|------|
| TypeScript | https://www.typescriptlang.org/docs/handbook/intro.html |
| React | https://react.dev/ |
| Next.js App Router | https://nextjs.org/docs/app |
| Drizzle ORM | https://orm.drizzle.team/ |
| Better Auth | https://www.better-auth.com/docs |
| Tailwind CSS | https://tailwindcss.com/docs |
| Radix UI | https://www.radix-ui.com/ |
| shadcn/ui | https://ui.shadcn.com/ |
| React Hook Form | https://react-hook-form.com/ |
| Zod | https://zod.dev/ |
| Vitest | https://vitest.dev/ |
| PostgreSQL | https://www.postgresqltutorial.com/ |
| pnpm | https://pnpm.io/motivation |
