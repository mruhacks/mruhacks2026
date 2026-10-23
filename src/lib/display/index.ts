// Client-safe half of the display module: `import * as X from '@/lib/display'`.
// Server-only code lives in ./server (which re-exports everything here too);
// only its types are exported from this file, so client components can use them.
export * from './schedule';
export type * from './feed';
