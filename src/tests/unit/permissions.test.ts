import { describe, test, expect } from 'vitest';
import * as Rbac from '@/lib/rbac';

describe('short permission strings', () => {
  test('a missing scope is treated as "all"', () => {
    expect(Rbac.anyPermissionMatches(['user:read'], 'user:read:self')).toBe(true);
    expect(Rbac.anyPermissionMatches(['user:read'], 'user:write:self')).toBe(false);
  });

  test('an entity alone grants no action', () => {
    expect(Rbac.anyPermissionMatches(['user'], 'user:read:all')).toBe(false);
  });
});

describe('a single grant', () => {
  test('exact match returns true', () => {
    expect(Rbac.anyPermissionMatches(['user:read:all'], 'user:read:all')).toBe(true);
  });

  test('different entity returns false', () => {
    expect(Rbac.anyPermissionMatches(['role:read:all'], 'user:read:all')).toBe(false);
  });

  test('different action returns false', () => {
    expect(Rbac.anyPermissionMatches(['user:write:all'], 'user:read:all')).toBe(false);
  });

  test('different scope returns false', () => {
    expect(Rbac.anyPermissionMatches(['user:read:self'], 'user:read:all')).toBe(false);
  });

  test('granted action=all covers any required action', () => {
    expect(Rbac.anyPermissionMatches(['user:all:self'], 'user:read:self')).toBe(true);
    expect(Rbac.anyPermissionMatches(['user:all:self'], 'user:write:self')).toBe(true);
    expect(Rbac.anyPermissionMatches(['user:all:self'], 'user:delete:self')).toBe(true);
  });

  test('granted action=all does not override entity mismatch', () => {
    expect(Rbac.anyPermissionMatches(['role:all:all'], 'user:read:all')).toBe(false);
  });

  test('granted scope=all covers self scope', () => {
    expect(Rbac.anyPermissionMatches(['user:read:all'], 'user:read:self')).toBe(true);
  });

  test('granted scope=self does NOT cover scope=all', () => {
    expect(Rbac.anyPermissionMatches(['user:read:self'], 'user:read:all')).toBe(false);
  });

  test('user:all:all covers any user permission', () => {
    expect(Rbac.anyPermissionMatches(['user:all:all'], 'user:read:all')).toBe(true);
    expect(Rbac.anyPermissionMatches(['user:all:all'], 'user:write:self')).toBe(true);
    expect(Rbac.anyPermissionMatches(['user:all:all'], 'user:delete:self')).toBe(true);
  });

  test('entity=all covers any entity', () => {
    expect(Rbac.anyPermissionMatches(['all:all:all'], 'user:read:all')).toBe(true);
    expect(Rbac.anyPermissionMatches(['all:all:all'], 'submission:edit:self')).toBe(true);
  });

  test('entity=all with specific action only covers matching action', () => {
    expect(Rbac.anyPermissionMatches(['all:read:all'], 'user:read:all')).toBe(true);
    expect(Rbac.anyPermissionMatches(['all:read:all'], 'user:write:all')).toBe(false);
  });

  test('granted scope=all with different entity returns false', () => {
    expect(Rbac.anyPermissionMatches(['role:read:all'], 'user:read:self')).toBe(false);
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
