// Client-safe half of the campaigns module: `import * as X from '@/lib/campaigns'`.
// Server-only code lives in ./server (which re-exports everything here too);
// only its types are exported from this file, so client components can use them.
export * from './audience-options';
export * from './audience-rules';
export * from './constants';
export * from './draft-saver';
export * from './email-blocks';
export * from './email-markdown';
export * from './merge-fields';
export * from './schedule-slots';
export * from './wallet-badges';
export type * from './audience';
export type * from './campaign-images';
export type * from './campaign-queue';
export type * from './content-checks';
export type * from './dispatch-due-campaigns';
export type * from './process-delivery';
export type * from './process-dispatch';
export type * from './queries';
export type * from './render-campaign-email';
export type * from './saved-audiences';
export type * from './unsubscribe';
export type * from './wallet-block';
