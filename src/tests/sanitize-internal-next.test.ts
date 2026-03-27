import { describe, it, expect } from 'vitest';
import { sanitizeInternalNextPath } from '@/utils/sanitize-internal-next';

describe('sanitizeInternalNextPath', () => {
  const cases: [Parameters<typeof sanitizeInternalNextPath>[0], string | undefined][] =
    [
      [undefined, undefined],
      [null, undefined],
      ['/dashboard/events', '/dashboard/events'],
      [['/foo'], '/foo'],
      ['//evil.com', undefined],
      ['/path\r\n', undefined],
      ['/path\\x', undefined],
      ['javascript:alert(1)', undefined],
      ['', undefined],
      ['   ', undefined],
      [123 as unknown as string, undefined],
    ];

  it.each(cases)('sanitizeInternalNextPath(%j) -> %j', (input, expected) => {
    expect(sanitizeInternalNextPath(input)).toBe(expected);
  });
});
