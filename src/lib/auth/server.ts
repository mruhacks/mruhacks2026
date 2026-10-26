import 'server-only';

// The whole auth module, for server code: `import * as X from '@/lib/auth/server'`.
export * from './index';
export * from './apply-pending-invite';
export * from './magic-link-cooldown';
export * from './resolve-magic-link-email';
