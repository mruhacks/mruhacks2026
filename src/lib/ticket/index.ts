// Client-safe half of the ticket module: `import * as X from '@/lib/ticket'`.
// Server-only code lives in ./server (which re-exports everything here too);
// only its types are exported from this file, so client components can use them.
export type * from './check-in';
export type * from './eligibility';
export type * from './view';
