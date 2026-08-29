import { describe, test, expect } from 'vitest';

import { oauthPrefillName } from '@/lib/oauth-name';

describe('oauthPrefillName', () => {
  test('returns an empty string when no provider name was stored', () => {
    expect(oauthPrefillName(null)).toBe('');
    expect(oauthPrefillName(undefined)).toBe('');
    expect(oauthPrefillName('')).toBe('');
    expect(oauthPrefillName('   ')).toBe('');
  });

  test('returns the trimmed provider name', () => {
    expect(oauthPrefillName('Jane Doe')).toBe('Jane Doe');
    expect(oauthPrefillName('  Jane Doe  ')).toBe('Jane Doe');
  });
});
