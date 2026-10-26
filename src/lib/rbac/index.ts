// Client-safe half of the rbac module: `import * as X from '@/lib/rbac'`.
// Server-only code lives in ./server (which re-exports everything here too);
// only its types are exported from this file, so client components can use them.
export * from './event-access';
export * from './permissions';
export type * from './authorization';
export type * from './guards';
export type * from './role-mutations';
