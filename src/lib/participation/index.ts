// Client-safe half of the participation module: `import * as X from '@/lib/participation'`.
// Server-only code lives in ./server (which re-exports everything here too);
// only its types are exported from this file, so client components can use them.
export * from './status';
export * from './transitions';
export type * from './queries';
