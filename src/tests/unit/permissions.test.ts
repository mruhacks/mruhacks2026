import { describe, test, expect } from 'vitest';
import {
  parsePermission,
  permissionMatches,
  anyPermissionMatches,
} from '@/lib/rbac/permissions';

describe('parsePermission', () => {
  test('parses a full 3-part permission string', () => {
    expect(parsePermission('user:read:all')).toEqual({
      entity: 'user',
      action: 'read',
      scope: 'all',
    });
  });

  test('defaults scope to "all" when only entity:action given', () => {
    expect(parsePermission('user:read')).toEqual({
      entity: 'user',
      action: 'read',
      scope: 'all',
    });
  });

  test('handles single-segment strings', () => {
    expect(parsePermission('user')).toEqual({
      entity: 'user',
      action: '',
      scope: 'all',
    });
  });

  test('preserves UUID scope values', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    expect(parsePermission(`registration:approve:${uuid}`)).toEqual({
      entity: 'registration',
      action: 'approve',
      scope: uuid,
    });
  });
});

describe('permissionMatches', () => {
  test('exact match returns true', () => {
    expect(permissionMatches('user:read:all', 'user:read:all')).toBe(true);
  });

  test('different entity returns false', () => {
    expect(permissionMatches('role:read:all', 'user:read:all')).toBe(false);
  });

  test('different action returns false', () => {
    expect(permissionMatches('user:write:all', 'user:read:all')).toBe(false);
  });

  test('different scope returns false', () => {
    expect(permissionMatches('user:read:self', 'user:read:all')).toBe(false);
  });

  test('granted action=all covers any required action', () => {
    expect(permissionMatches('user:all:self', 'user:read:self')).toBe(true);
    expect(permissionMatches('user:all:self', 'user:write:self')).toBe(true);
    expect(permissionMatches('user:all:self', 'user:delete:self')).toBe(true);
  });

  test('granted action=all does not override entity mismatch', () => {
    expect(permissionMatches('role:all:all', 'user:read:all')).toBe(false);
  });

  test('granted scope=all covers self scope', () => {
    expect(permissionMatches('user:read:all', 'user:read:self')).toBe(true);
  });

  test('granted scope=self does NOT cover scope=all', () => {
    expect(permissionMatches('user:read:self', 'user:read:all')).toBe(false);
  });

  test('user:all:all covers any user permission', () => {
    expect(permissionMatches('user:all:all', 'user:read:all')).toBe(true);
    expect(permissionMatches('user:all:all', 'user:write:self')).toBe(true);
    expect(permissionMatches('user:all:all', 'user:delete:self')).toBe(true);
  });

  test('entity=all covers any entity', () => {
    expect(permissionMatches('all:all:all', 'user:read:all')).toBe(true);
    expect(permissionMatches('all:all:all', 'submission:edit:self')).toBe(true);
  });

  test('entity=all with specific action only covers matching action', () => {
    expect(permissionMatches('all:read:all', 'user:read:all')).toBe(true);
    expect(permissionMatches('all:read:all', 'user:write:all')).toBe(false);
  });

  test('granted scope=all with different entity returns false', () => {
    expect(permissionMatches('role:read:all', 'user:read:self')).toBe(false);
  });
});

describe('anyPermissionMatches', () => {
  test('returns false for empty granted set', () => {
    expect(anyPermissionMatches(new Set(), 'user:read:all')).toBe(false);
  });

  test('returns false for empty granted array', () => {
    expect(anyPermissionMatches([], 'user:read:all')).toBe(false);
  });

  test('returns true when exact match exists', () => {
    expect(anyPermissionMatches(new Set(['user:read:all']), 'user:read:all')).toBe(true);
  });

  test('returns true when a wildcard covers the required permission', () => {
    expect(anyPermissionMatches(new Set(['user:all:all']), 'user:read:self')).toBe(true);
  });

  test('returns false when no granted permission covers required', () => {
    expect(
      anyPermissionMatches(
        new Set(['role:read:all', 'event:manage:all']),
        'user:read:all',
      ),
    ).toBe(false);
  });

  test('returns true if at least one of multiple granted permissions matches', () => {
    expect(
      anyPermissionMatches(
        new Set(['role:read:all', 'user:read:all']),
        'user:read:all',
      ),
    ).toBe(true);
  });

  test('works with array iterables', () => {
    expect(anyPermissionMatches(['user:read:all'], 'user:read:all')).toBe(true);
  });
});
