# Architecture Overview

This document provides an overview of the MRU Hacks 2026 platform architecture.

## Terminology (Glossary)

Use these terms consistently across UI, code, and docs:

1. **Sign up** – Create a site account (email/password). Do not use "register" for account creation.
2. **Sign in** – Log into the site.
3. **Apply to an event** – For events with an application (`has_application`): user fills profile + event application form. Data in `event_applications` (with `status_id` for manual review: pending_review → approved / denied / waitlisted). UI: "Apply", "Edit application", "applied".
4. **Register for an event** – For events without an application: one-click to attend. UI: "Register", "You are registered", "Unregister".
5. **Event application** – The form and stored data for events that require an application. Use "application" (not "registration") for this flow.
6. **Profile** – User profile (shared across events).
7. **Attendee** – A user in `event_attendees`.
8. **Group** – A team associated with an event; members are in `group_members`. Use for "group" or "team" in UI and docs.
9. **Submission** – A group's submission to an event (e.g. project); stored in `submissions`. Distinct from "event application" (user applying to attend).
10. **Check-in** – Physical verification that an attendee is present (e.g. at event start or at a meal). One row per user per event in `check_ins`; the event can be the main event or a sub-event (e.g. meal). UI: "Check in", "Checked in", etc.

In authz, the entity **"application"** means event application (permissions: approve, reject, read).

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org) with React 19 and App Router
- **Authentication**: [Better Auth](https://www.better-auth.com/) (email/password, required email verification, password reset)
- **Transactional email (dev)**: SMTP via [MailHog](https://github.com/mailhog/MailHog) in Docker; production uses the same env-driven SMTP interface ([SETUP.md](./SETUP.md))
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
│   │   ├── (auth)/       # signin, signup, forgot-password, reset-password
│   │   ├── verify-email/ # Resend verification (outside dashboard shell)
│   │   ├── dashboard/    # Dashboard pages and features (verified users only)
│   │   │   └── events/
│   │   │       └── [eventId]/apply/  # Event application flow (apply to event)
│   │   └── register/     # Event registration (simple signup) — protected like dashboard
│   ├── components/       # Reusable React components
│   │   └── ui/           # Base UI components (shadcn/ui)
│   ├── db/               # Database schema and configurations
│   │   ├── schema.ts     # Main schema exports
│   │   ├── lookups.ts    # Lookup tables (genders, universities, etc.)
│   │   ├── events-and-participation.ts  # Events, applications, RSVP waves/responses, attendees, groups
│   │   └── auth-schema.ts    # Better Auth schema
│   ├── utils/            # Utility functions
│   │   ├── auth.ts       # Better Auth config, getSession, requireVerifiedUser
│   │   ├── auth-client.ts
│   │   ├── mail.ts       # nodemailer SMTP (verification + reset emails)
│   │   ├── post-auth-redirect.ts  # resolvePostAuthRedirect (profile vs events)
│   │   ├── db.ts         # Database connection
│   │   └── action-result.ts  # Server action result types
│   ├── proxy.ts          # Next.js 16 network-boundary: cookie-only gate for /dashboard, /register
│   ├── hooks/            # Custom React hooks
├── scripts/              # Utility scripts (e.g., database seeding)
├── public/               # Static assets
├── drizzle/              # Database migrations
└── docs/                 # Documentation
```

## Key Features

- **User Authentication**: Email/password with **required email verification** before app access; forgot/reset password; transactional mail via SMTP (MailHog locally — see [SETUP.md](./SETUP.md))
- **Event Applications**: Event-scoped application flow; events can have applications (full form) or simple signup; application questions are stored on the event
- **Dashboard**:
  - Settings management
  - Group/team management
  - Event schedule
  - Meal tracking
  - Workshop registration
  - Project submissions
- **Responsive Design**: Mobile-first design with tablet and desktop support
- **Route Protection**: Next.js **proxy** (`src/proxy.ts`) performs an optimistic session **cookie** check for `/dashboard` and `/register`; **email verification and full session validation** run in server components via `requireVerifiedUser()` (see below)

## Database Architecture

### Schema Organization

The database schema is organized into three main modules:

1. **auth-schema.ts**: Better Auth tables (users, sessions, accounts)
2. **lookups.ts**: Reference tables for form options (genders, universities, majors, etc.)
3. **events-and-participation.ts**: Events (with `capacity`, optional `event_type_id`), user profiles, event applications (with application status, waitlist position), event RSVP waves and responses, event attendees, check-ins, groups, group members, and submissions

### Key Tables

- `user`: Authenticated users (Better Auth)
- `events`: Events (e.g. hackathon, workshops); optional `parent_event_id` (self-FK) for parent/child hierarchy; optional `event_type_id` (FK to `event_types`: meal, workshop, hackathon); `has_application` and `application_questions` (JSONB) define whether and how users apply; optional `capacity` for waitlist/event-full logic
- `check_ins`: One row per user per event (door check-in or meal check-in); unique on `(user_id, event_id)`; `checked_in_at` timestamp
- `user_profiles`: Profile fields shared across applications (full name, gender, university, major, year of study)
- `user_interests` / `user_dietary_restrictions`: User-level many-to-many with lookups
- `event_applications`: One per user per event (when event has application); `id` (uuid PK), unique on `(event_id, user_id)`; `status_id` (FK to `application_statuses`: pending_review, approved, denied, waitlisted), optional `reviewed_at` / `reviewed_by` / `waitlist_position`; `responses` (JSONB) stores application answers
- `event_rsvp_waves`: One row per invitation wave per event (wave number, `respond_by` deadline)
- `event_rsvp_responses`: One row per user per wave; `status_id` (FK to `rsvp_statuses`: pending, accepted, declined, timed_out), `responded_at`
- `event_attendees`: Simple signup for events without applications; also used for accepted RSVPs
- `groups`: Groups (teams) hosted by an event; `id`, `event_id` (FK to events), `name`
- `group_members`: Junction `(group_id, user_id)`; groups contain users
- `submissions`: Group submissions to events; `id`, `group_id`, `event_id`, `submitted_at`; groups submit to events

### Database Views

- `application_view`: Denormalized view for displaying application data (profile + event + responses)
- `application_form_view`: Structured view for pre-filling the application form (profile + responses)

See [Database Configuration](./DATABASE.md) for more details.

### Registration flow (state diagram)

The following state diagram describes the registration flow: event type check, application process with manual review, RSVP (including waitlist and time out), and attendance. For events without an application, participants who show up without having registered can be asked to register and then follow the normal flow.

```mermaid
stateDiagram-v2
    [*] --> checkType

    checkType --> ApplicationProcess : Requires Application
    checkType --> Accepted : No Application

    ApplicationProcess --> ManualReview

    ManualReview --> Waitlist
    ManualReview --> RSVP : Approved
    ManualReview --> Denied

    state "Check Event Type" as checkType
    state "Application Process" as ApplicationProcess
    state "Event Full" as EventFull
    state "Manual Review Process" as ManualReview
    state "Time Out" as TimeOut
    state "Checked-in" as Showing
    state "No Show" as NoShow
    state "RSVP Process" as RSVPProcess {
        RSVP --> Accepted
        RSVP --> Decline
        RSVP --> TimeOut : missed deadline
        Waitlist --> RSVP : Spot Opens
        Waitlist --> EventFull : No spot opens
        Waitlist --> Decline
    }
    state Attendance {
        Accepted --> Decline : Declined later
        Accepted --> Showing
        Accepted --> NoShow
    }
```

## Authentication Flow

Better Auth is configured in [`src/utils/auth.ts`](src/utils/auth.ts): `baseURL` from `BETTER_AUTH_URL`, `emailVerification` (send on sign-up; links expire after 24 hours), `emailAndPassword.requireEmailVerification`, and `sendResetPassword` for forgot-password flows. Outbound mail uses [`src/utils/mail.ts`](src/utils/mail.ts) (nodemailer + env from [SETUP.md](./SETUP.md)).

### Sign-up (client → API)

```mermaid
sequenceDiagram
  participant User
  participant SignupPage
  participant AuthLayout
  participant SignUpForm
  participant AuthClient
  participant API
  participant Mail

  User->>SignupPage: GET /signup
  SignupPage->>AuthLayout: children (TabsContent)
  AuthLayout->>User: Tabs + SignUpForm
  User->>SignUpForm: submit (name, email, password)
  SignUpForm->>AuthClient: signUp.email(details, callbacks)
  AuthClient->>API: POST /api/auth/...
  API->>Mail: send verification email (async)
  API-->>AuthClient: session / error
  AuthClient-->>SignUpForm: onSuccess / onError
  SignUpForm->>User: toast + redirect to /verify-email
```

1. User signs up via `/signup` with email and password.
2. Better Auth creates the account and sends a verification email (when enabled).
3. Until the user verifies, sign-in may fail with **403**; the sign-in form shows a toast directing them to check email or `/verify-email`.
4. After verification (and `autoSignInAfterVerification` when applicable), the user can sign in.

### Sign-in and post-auth routing

1. Successful sign-in from [`src/components/signIn.tsx`](src/components/signIn.tsx) navigates to **`/dashboard`**.
2. [`src/app/dashboard/page.tsx`](src/app/dashboard/page.tsx) calls **`resolvePostAuthRedirect()`** ([`src/utils/post-auth-redirect.ts`](src/utils/post-auth-redirect.ts)): requires a verified session, loads `getUserProfile()`, then redirects to **`/dashboard/profile?next=...`** if there is no profile row, or to **`/dashboard/events`** (or a safe same-origin `next` query param) when a profile exists.

### Verified-user guard

**`requireVerifiedUser()`** ([`src/utils/auth.ts`](src/utils/auth.ts)) is used in the dashboard shell and other server entry points (`register`, `events` content, etc.):

- No session → redirect to `/signin` with `callbackUrl` (default `/dashboard`).
- Session but `emailVerified` false → redirect to **`/verify-email`**.
- Verified → returns the user object.

There is **no** authenticated access to dashboard or `/register` content without a verified email.

### Password reset

- **`/forgot-password`**: requests a reset link via Better Auth (`requestPasswordReset` with absolute `redirectTo` to the reset page).
- **`/reset-password`**: reads `token` from the query string and submits `resetPassword` with the new password.

## Route protection (summary)

```mermaid
flowchart TD
  subgraph proxyLayer [Proxy cookie check]
    P[Session cookie present?]
    P -->|no| SI[Redirect /signin with callbackUrl]
    P -->|yes| RSC[Server components run]
  end
  subgraph server [Server guards]
    RSC --> V[requireVerifiedUser]
    V -->|no session| SI2[Redirect /signin]
    V -->|unverified| VE[Redirect /verify-email]
    V -->|verified| OK[Render or mutate]
  end
```

Matchers for the proxy are defined in [`src/proxy.ts`](src/proxy.ts): `/dashboard/:path*`, `/register`, `/register/:path*`. **Email verification is not enforced in the proxy** — only `requireVerifiedUser` (and equivalent checks in server actions) enforces that policy.

## Event Application Flow

Apply-to-event flow (two sections: profile form and event application form, each with its own submit):

```mermaid
sequenceDiagram
  participant User
  participant ApplyPage
  participant getPreviousFormSubmission
  participant getUserProfile
  participant getOptions
  participant ProfileForm
  participant ApplicationForm
  participant submitEventApplication
  participant registerParticipant

  User->>ApplyPage: GET /dashboard/events/[eventId]/apply
  ApplyPage->>ApplyPage: Load event, check hasApplication
  ApplyPage->>getPreviousFormSubmission: eventId
  ApplyPage->>getUserProfile: -
  ApplyPage->>getOptions: -
  getPreviousFormSubmission-->>ApplyPage: prev
  getUserProfile-->>ApplyPage: profileData
  getOptions-->>ApplyPage: options
  ApplyPage->>ApplyPage: buildApplyInitials(prev, profileData, user)
  ApplyPage->>User: ProfileForm and ApplicationForm (two sections)

  User->>ProfileForm: Save Changes (optional)
  ProfileForm->>User: saveUserProfile (profile only)

  User->>ApplicationForm: Save (event questions)
  ApplicationForm->>submitEventApplication: eventData, eventId
  submitEventApplication->>getUserProfile: -
  getUserProfile-->>submitEventApplication: profile
  submitEventApplication->>registerParticipant: profile, eventData, eventId
  registerParticipant->>registerParticipant: buildApplicationResponses, upsert profile, interests, dietary, event_applications
  registerParticipant-->>User: ok or fail
```

1. User opens the apply page for an event that has an application (`has_application`).
2. The page loads the event, previous submission (if any), profile, and form options in parallel; `buildApplyInitials` derives initial values for profile and event sections.
3. The page renders two sections: **ProfileForm** (with "Save Changes" to save profile only) and **ApplicationForm** (event questions with "Save" to submit the application).
4. Submitting the event section calls `submitEventApplication(eventData, eventId)`, which fetches the current profile server-side and then calls `registerParticipant(profile, eventData, eventId)` to upsert profile, interests, dietary restrictions, and `event_applications.responses` in one transaction.

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
const result = await registerParticipant(formData, eventId);
if (result.success) {
  // Handle success
} else {
  // Display result.error
}
```

## Network boundary (proxy)

Next.js 16 uses a **proxy** module at [`src/proxy.ts`](src/proxy.ts) (not `middleware.ts`):

- **Matchers**: `/dashboard/:path*`, `/register`, `/register/:path*`
- **Behavior**: `getSessionCookie` from `better-auth/cookies` — **optimistic** check only (no database). If the cookie is missing, redirect to `/signin` with a same-origin-safe `callbackUrl`.
- **Authoritative checks**: Session + `emailVerified` are enforced in **`requireVerifiedUser()`** in server components and server actions; the proxy does not verify email.

For environment variables and MailHog, see [SETUP.md](./SETUP.md).

## Form Validation

Forms use:

- **React Hook Form** for form state management
- **Zod** for schema validation
- **@hookform/resolvers** to integrate Zod with React Hook Form

Validation occurs on both client and server sides for security.
