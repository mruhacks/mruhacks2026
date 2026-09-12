import { describe, test, expect } from 'vitest';
import { cn } from '@/lib/utils';
import { sanitizeReturnPath } from '@/utils/return-path';

describe('cn', () => {
  test('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  test('deduplicates conflicting tailwind classes', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  test('ignores falsy values', () => {
    expect(cn('foo', undefined, null, false, 'bar')).toBe('foo bar');
  });
});

describe('sanitizeReturnPath', () => {
  test('passes through a safe same-origin path', () => {
    expect(sanitizeReturnPath('/dashboard')).toBe('/dashboard');
    expect(sanitizeReturnPath('/dashboard/events')).toBe('/dashboard/events');
  });

  test('falls back when input is null', () => {
    expect(sanitizeReturnPath(null)).toBe('/dashboard');
  });

  test('falls back when input is undefined', () => {
    expect(sanitizeReturnPath(undefined)).toBe('/dashboard');
  });

  test('falls back when input is empty string', () => {
    expect(sanitizeReturnPath('')).toBe('/dashboard');
  });

  test('falls back for a protocol-relative URL (// attack)', () => {
    expect(sanitizeReturnPath('//evil.com')).toBe('/dashboard');
  });

  test('falls back for a backslash trick (/\\ attack)', () => {
    expect(sanitizeReturnPath('/\\evil.com')).toBe('/dashboard');
  });

  test('falls back for an absolute URL', () => {
    expect(sanitizeReturnPath('https://evil.com')).toBe('/dashboard');
  });

  test('falls back for a relative path (no leading slash)', () => {
    expect(sanitizeReturnPath('dashboard')).toBe('/dashboard');
  });

  test('respects a custom fallback', () => {
    expect(sanitizeReturnPath(null, '/signin')).toBe('/signin');
    expect(sanitizeReturnPath('//evil.com', '/signin')).toBe('/signin');
  });
});
