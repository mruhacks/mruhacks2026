// Client-safe half of the dietary module: `import * as X from '@/lib/dietary'`.
// Server-only code lives in ./server (which re-exports everything here too);
// only its types are exported from this file, so client components can use them.
export * from './report';
export type * from './load';
