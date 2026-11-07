import 'server-only';

// The whole auth module, for server code: `import * as X from '@/lib/auth/server'`.
export * from './index';
// Ahead of ./apply-pending-invite on purpose: `src/utils/auth.ts` calls
// `magicLink()` while it's being initialised, and apply-pending-invite's
// imports (via `@/lib/rbac/server`) circle back to it. Evaluated first, the
// plugin is defined by the time that cycle reaches `src/utils/auth.ts`.
export * from './magic-link-plugin';
export * from './apply-pending-invite';
export * from './magic-link';
export * from './magic-link-cooldown';
export * from './sign-in-link';
