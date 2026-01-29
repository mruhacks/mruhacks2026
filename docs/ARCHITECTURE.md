# Architecture Overview

This document provides an overview of the MRU Hacks 2026 platform architecture.

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org) with React 19 and App Router
- **Authentication**: [Better Auth](https://www.better-auth.com/)
- **Database**: PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [Radix UI](https://www.radix-ui.com/)
- **Form Management**: React Hook Form with Zod validation
- **Language**: TypeScript
- **Testing**: Vitest

## Project Structure

```
mruhacks2026/
├── src/
│   ├── app/              # Next.js App Router pages and layouts
│   │   ├── (auth)/       # Authentication pages (signin, signup)
│   │   ├── dashboard/    # Dashboard pages and features
│   │   └── register/     # Registration flow
│   ├── components/       # Reusable React components
│   │   ├── ui/           # Base UI components (shadcn/ui)
│   ├── db/               # Database schema and configurations
│   │   ├── schema.ts     # Main schema exports
│   │   ├── lookups.ts    # Lookup tables (genders, universities, etc.)
│   │   ├── registrations.ts  # Participant registration tables
│   │   └── auth-schema.ts    # Better Auth schema
│   ├── utils/            # Utility functions
│   │   ├── auth.ts       # Authentication utilities
│   │   ├── db.ts         # Database connection
│   │   └── action-result.ts  # Server action result types
│   ├── hooks/            # Custom React hooks
│   └── middleware.ts     # Next.js middleware for route protection
├── scripts/              # Utility scripts (e.g., database seeding)
├── public/               # Static assets
├── drizzle/              # Database migrations
└── docs/                 # Documentation
```

## Key Features

- **User Authentication**: Sign up and sign in using email/password
- **Participant Registration**: Comprehensive registration form with validation
- **Dashboard**: 
  - Settings management
  - Group/team management
  - Event schedule
  - Meal tracking
  - Workshop registration
  - Project submissions
- **Responsive Design**: Mobile-first design with tablet and desktop support
- **Route Protection**: Middleware-based authentication for protected routes

## Database Architecture

### Schema Organization

The database schema is organized into three main modules:

1. **auth-schema.ts**: Better Auth tables (users, sessions, accounts)
2. **lookups.ts**: Reference tables for form options (genders, universities, majors, etc.)
3. **registrations.ts**: Participant registration data and relationships

### Key Tables

- `user`: Authenticated users (Better Auth)
- `participants`: Hackathon participant information (1:1 with users)
- `participant_interests`: Many-to-many relationship for interests
- `participant_dietary_restrictions`: Many-to-many relationship for dietary needs

### Database Views

- `participant_view`: Denormalized view for displaying participant data
- `participant_form_view`: Structured view for populating registration forms

See [Database Configuration](./DATABASE.md) for more details.

## Authentication Flow

1. User signs up via `/signup` with email and password
2. Better Auth creates a user account and session
3. Middleware checks session for protected routes (`/dashboard/*`)
4. Unauthenticated requests to protected routes redirect to `/forbidden`
5. Authenticated users can access dashboard features

## Server Actions Pattern

All server actions follow a consistent pattern using the `ActionResult` type:

```typescript
export type ActionResult<T = unknown> = 
  | { success: true; data?: T }
  | { success: false; error: string };
```

This provides:
- Type-safe responses
- Consistent error handling
- Easy client-side consumption

Example:
```typescript
const result = await registerParticipant(formData);
if (result.success) {
  // Handle success
} else {
  // Display result.error
}
```

## Middleware

Next.js middleware (`src/middleware.ts`) protects dashboard routes:

- Intercepts requests to `/dashboard`
- Checks for valid session
- Redirects unauthenticated users to `/forbidden`
- Allows authenticated requests to proceed

## Form Validation

Forms use:
- **React Hook Form** for form state management
- **Zod** for schema validation
- **@hookform/resolvers** to integrate Zod with React Hook Form

Validation occurs on both client and server sides for security.
