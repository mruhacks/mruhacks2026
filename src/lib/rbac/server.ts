import 'server-only';

// The whole rbac module, for server code: `import * as X from '@/lib/rbac/server'`.
export * from './index';
export * from './authorization';
export * from './guards';
export * from './role-mutations';
