import { describe, test, expect } from 'vitest';
import { ok, fail } from '@/utils/action-result';

describe('ok', () => {
  test('returns success: true with no data', () => {
    const result = ok();
    expect(result.success).toBe(true);
    expect(result.data).toBeUndefined();
  });

  test('returns success: true with provided data', () => {
    const result = ok({ id: 42 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 42 });
  });

  test('preserves falsy data values', () => {
    expect(ok(0).data).toBe(0);
    expect(ok('').data).toBe('');
    expect(ok(false).data).toBe(false);
    expect(ok(null).data).toBeNull();
  });

  test('preserves arrays and nested objects', () => {
    const data = [1, 2, 3];
    expect(ok(data).data).toBe(data);
  });
});

describe('fail', () => {
  test('returns success: false with error message', () => {
    const result = fail('something went wrong');
    expect(result.success).toBe(false);
    expect(result.error).toBe('something went wrong');
  });

  test('preserves the error string exactly', () => {
    const msg = 'Failed to list roles: connection refused';
    expect(fail(msg).error).toBe(msg);
  });

  test('does not include a data field', () => {
    const result = fail('error');
    expect('data' in result).toBe(false);
  });
});
