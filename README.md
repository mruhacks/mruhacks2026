# MRU Hacks 2026

A comprehensive hackathon management platform built with Next.js, featuring participant registration, authentication, and dashboard functionality.

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Docker (for local database)

### Setup

1. **Clone and install:**
   ```bash
   git clone https://github.com/Kapocsi/mruhacks2026.git
   cd mruhacks2026
   npm install
   ```

2. **Start local database:**
   ```bash
   ./localdb.sh
   ```
   Copy the output `DATABASE_URL` into your `.env` file.

3. **Run migrations:**
   ```bash
   npx drizzle-kit push
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

Visit [http://localhost:3000](http://localhost:3000) to see the app.

## 📚 Documentation

- **[Setup Guide](./docs/SETUP.md)** - Detailed setup instructions, database configuration, and Drizzle usage
- **[Architecture](./docs/ARCHITECTURE.md)** - Project structure, tech stack, and design patterns
- **[Database Guide](./docs/DATABASE.md)** - Database configuration, migrations, and Drizzle commands
- **[Contributing](./CONTRIBUTING.md)** - Development guidelines and best practices

## 🛠️ Common Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run lint         # Run ESLint
npx drizzle-kit push # Sync database schema (dev)
npx drizzle-kit studio # Open database browser
npx vitest           # Run tests
```

## 🔑 Key Features

- User authentication (email/password)
- Participant registration system
- Dashboard with event management
- Responsive UI with Tailwind CSS
- Type-safe database with Drizzle ORM

## 🏗️ Tech Stack

- **Framework**: Next.js 15 (React 19, App Router)
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Better Auth
- **Styling**: Tailwind CSS + Radix UI
- **Language**: TypeScript

## 📄 License

This project is private and proprietary.

## 🔗 Resources

- [Next.js Docs](https://nextjs.org/docs)
- [Drizzle ORM Docs](https://orm.drizzle.team)
- [Better Auth Docs](https://www.better-auth.com/docs)
