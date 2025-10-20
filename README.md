# MRU Hacks 2026

A comprehensive hackathon management platform built with Next.js, featuring participant registration, authentication, and dashboard functionality.

## 🚀 Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org) with React 19 and App Router
- **Authentication**: [Better Auth](https://www.better-auth.com/)
- **Database**: PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [Radix UI](https://www.radix-ui.com/)
- **Form Management**: React Hook Form with Zod validation
- **Language**: TypeScript
- **Testing**: Vitest

## 📋 Features

- User authentication (sign up, sign in)
- Participant registration with comprehensive form
- Dashboard with multiple sections:
  - Settings
  - Group management
  - Schedule
  - Meals
  - Workshops
  - Submissions
- Responsive design with mobile support
- Role-based access control via middleware

## 🏗️ Project Structure

```
mruhacks2026/
├── src/
│   ├── app/              # Next.js App Router pages and layouts
│   │   ├── (auth)/       # Authentication pages (signin, signup)
│   │   ├── dashboard/    # Dashboard pages and features
│   │   └── register/     # Registration flow
│   ├── components/       # Reusable React components
│   │   ├── ui/           # Base UI components (shadcn/ui)
│   │   └── ...           # Feature-specific components
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
└── drizzle/              # Database migrations
```

## 🛠️ Getting Started

### Prerequisites

- Node.js 20+ or Bun
- PostgreSQL database
- npm, yarn, pnpm, or bun

### Environment Setup

1. Clone the repository:
```bash
git clone https://github.com/Kapocsi/mruhacks2026.git
cd mruhacks2026
```

2. Install dependencies:
```bash
npm install
# or
pnpm install
# or
bun install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Configure your environment variables:
```env
# Database connection (choose one method)
# Method 1: Individual PostgreSQL variables
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password
POSTGRES_DB=your_database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Method 2: Full connection string
DATABASE_URL=postgres://user:password@host:port/database

# Better Auth
BETTER_AUTH_SECRET=your_secret_key
BETTER_AUTH_URL=http://localhost:3000
```

### Database Setup

1. Run database migrations:
```bash
npx drizzle-kit push
```

2. (Optional) Seed the database:
```bash
npx tsx scripts/seed.ts
```

### Development

Start the development server:

```bash
npm run dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

The page auto-updates as you edit files in the `src` directory.

### Building for Production

```bash
npm run build
npm start
```

## 🧪 Testing

Run the test suite:

```bash
npx vitest
# or for watch mode
npx vitest --watch
```

## 🔍 Linting

Check code quality:

```bash
npm run lint
```

## 📚 Key Concepts

### Database Configuration

The application supports two methods of database configuration:
1. Individual PostgreSQL environment variables (constructed URL)
2. Explicit `DATABASE_URL` connection string

The `getDatabaseURL()` utility validates these configurations and ensures no conflicts.

### Authentication

Authentication is handled by Better Auth with email/password authentication enabled. The middleware protects dashboard routes, redirecting unauthenticated users to `/forbidden`.

### Server Actions

Server actions follow a consistent pattern using the `ActionResult` type, which provides type-safe success/error responses.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and best practices.

## 📄 License

This project is private and proprietary.

## 🔗 Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
