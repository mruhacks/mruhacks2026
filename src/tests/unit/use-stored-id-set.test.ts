import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Exercise the external store through its hook, without a DOM renderer.
vi.mock('react', () => ({
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) =>
    getSnapshot(),
}));

import { useStoredIdSet } from '@/lib/use-stored-id-set';

let keyIndex = 0;
let key: string;
let values: Map<string, string>;
let getItem: ReturnType<typeof vi.fn>;
let setItem: ReturnType<typeof vi.fn>;

beforeEach(() => {
  key = `stats-${keyIndex++}`;
  values = new Map([[key, '["existing"]']]);
  getItem = vi.fn((id: string) => values.get(id) ?? null);
  setItem = vi.fn((id: string, value: string) => values.set(id, value));
  vi.stubGlobal('window', { localStorage: { getItem, setItem } });
});

afterEach(() => vi.unstubAllGlobals());

describe('stored selections', () => {
  test('retains toggles and clear when writes fail but stale reads succeed', () => {
    setItem.mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    const selection = useStoredIdSet(key);
    expect([...selection.ids!]).toEqual(['existing']);

    selection.toggle('new');
    expect([...useStoredIdSet(key).ids!]).toEqual(['existing', 'new']);
    selection.toggle('existing');
    expect([...useStoredIdSet(key).ids!]).toEqual(['new']);
    selection.clear();
    expect([...useStoredIdSet(key).ids!]).toEqual([]);
    expect(values.get(key)).toBe('["existing"]');
  });

  test('works with blocked reads and writes and persists after recovery', () => {
    getItem.mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    setItem.mockImplementationOnce(() => {
      throw new Error('Storage blocked');
    });
    const selection = useStoredIdSet(key);
    selection.toggle('first');
    const snapshot = useStoredIdSet(key).ids;
    expect([...snapshot!]).toEqual(['first']);
    expect(useStoredIdSet(key).ids).toBe(snapshot);

    selection.toggle('second');
    // A successful write is still usable while reads remain blocked.
    expect([...useStoredIdSet(key).ids!]).toEqual(['first', 'second']);
    expect(values.get(key)).toBe('["first","second"]');
    getItem.mockImplementation((id: string) => values.get(id) ?? null);
    expect([...useStoredIdSet(key).ids!]).toEqual(['first', 'second']);
  });

  test('continues reading external changes after successful writes', () => {
    const selection = useStoredIdSet(key);
    selection.toggle('new');
    expect(values.get(key)).toBe('["existing","new"]');
    values.set(key, '["another-tab"]');
    expect([...useStoredIdSet(key).ids!]).toEqual(['another-tab']);
    values.delete(key);
    expect([...useStoredIdSet(key).ids!]).toEqual([]);
  });
});
