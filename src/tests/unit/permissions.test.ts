import { describe, test, expect } from 'vitest';
import * as Rbac from '@/lib/rbac';

describe('parsePermission', () => {
  test('parses a full 3-part permission string', () => {
    expect(Rbac.parsePermission('user:read:all')).toEqual({
      entity: 'user',
      action: 'read',
      scope: 'all',
    });
  });

  test('defaults scope to "all" when only entity:action given', () => {
    expect(Rbac.parsePermission('user:read')).toEqual({
      entity: 'user',
      action: 'read',
      scope: 'all',
    });
  });

  test('handles single-segment strings', () => {
    expect(Rbac.parsePermission('user')).toEqual({
      entity: 'user',
      action: '',
      scope: 'all',
    });
  });

  test('preserves UUID scope values', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    expect(Rbac.parsePermission(`registration:approve:${uuid}`)).toEqual({
      entity: 'registration',
      action: 'approve',
      scope: uuid,
    });
  });
});

describe('permissionMatches', () => {
  test('exact match returns true', () => {
    expect(Rbac.permissionMatches('user:read:all', 'user:read:all')).toBe(true);
  });

  test('different entity returns false', () => {
    expect(Rbac.permissionMatches('role:read:all', 'user:read:all')).toBe(false);
  });

  test('different action returns false', () => {
    expect(Rbac.permissionMatches('user:write:all', 'user:read:all')).toBe(false);
  });

  test('different scope returns false', () => {
    expect(Rbac.permissionMatches('user:read:self', 'user:read:all')).toBe(false);
  });

  test('granted action=all covers any required action', () => {
    expect(Rbac.permissionMatches('user:all:self', 'user:read:self')).toBe(true);
    expect(Rbac.permissionMatches('user:all:self', 'user:write:self')).toBe(true);
    expect(Rbac.permissionMatches('user:all:self', 'user:delete:self')).toBe(true);
  });

  test('granted action=all does not override entity mismatch', () => {
    expect(Rbac.permissionMatches('role:all:all', 'user:read:all')).toBe(false);
  });

  test('granted scope=all covers self scope', () => {
    expect(Rbac.permissionMatches('user:read:all', 'user:read:self')).toBe(true);
  });

  test('granted scope=self does NOT cover scope=all', () => {
    expect(Rbac.permissionMatches('user:read:self', 'user:read:all')).toBe(false);
  });

  test('user:all:all covers any user permission', () => {
    expect(Rbac.permissionMatches('user:all:all', 'user:read:all')).toBe(true);
    expect(Rbac.permissionMatches('user:all:all', 'user:write:self')).toBe(true);
    expect(Rbac.permissionMatches('user:all:all', 'user:delete:self')).toBe(true);
  });

  test('entity=all covers any entity', () => {
    expect(Rbac.permissionMatches('all:all:all', 'user:read:all')).toBe(true);
    expect(Rbac.permissionMatches('all:all:all', 'submission:edit:self')).toBe(true);
  });

  test('entity=all with specific action only covers matching action', () => {
    expect(Rbac.permissionMatches('all:read:all', 'user:read:all')).toBe(true);
    expect(Rbac.permissionMatches('all:read:all', 'user:write:all')).toBe(false);
  });

  test('granted scope=all with different entity returns false', () => {
    expect(Rbac.permissionMatches('role:read:all', 'user:read:self')).toBe(false);
  });
});

describe('anyPermissionMatches', () => {
  test('returns false for empty granted set', () => {
    expect(Rbac.anyPermissionMatches(new Set(), 'user:read:all')).toBe(false);
  });

  test('returns false for empty granted array', () => {
    expect(Rbac.anyPermissionMatches([], 'user:read:all')).toBe(false);
  });

  test('returns true when exact match exists', () => {
    expect(Rbac.anyPermissionMatches(new Set(['user:read:all']), 'user:read:all')).toBe(true);
  });

  test('returns true when a wildcard covers the required permission', () => {
    expect(Rbac.anyPermissionMatches(new Set(['user:all:all']), 'user:read:self')).toBe(true);
  });

  test('returns false when no granted permission covers required', () => {
    expect(Rbac.anyPermissionMatches(new Set(['role:read:all', 'event:manage:all']), 'user:read:all')).toBe(false);
  });

  test('returns true if at least one of multiple granted permissions matches', () => {
    expect(Rbac.anyPermissionMatches(new Set(['role:read:all', 'user:read:all']), 'user:read:all')).toBe(true);
  });

  test('works with array iterables', () => {
    expect(Rbac.anyPermissionMatches(['user:read:all'], 'user:read:all')).toBe(true);
  });
});
