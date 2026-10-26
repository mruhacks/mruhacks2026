// Client-safe half of the auth module: `import * as X from '@/lib/auth'`.
// Server-only code lives in ./server (which re-exports everything here too);
// only its types are exported from this file, so client components can use them.
export * from './email-link-confirm-url';
export type * from './apply-pending-invite';
export type * from './magic-link-cooldown';
export type * from './resolve-magic-link-email';
