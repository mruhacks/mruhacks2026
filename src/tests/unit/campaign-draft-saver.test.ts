import { describe, expect, test, vi } from 'vitest';
import * as Campaigns from '@/lib/campaigns';

describe('saving before campaign confirmation', () => {
  test('flush saves pending edits without waiting for autosave', async () => {
    const persist = vi.fn().mockResolvedValue({ success: true });
    const saver = new Campaigns.DraftSaver<string>('saved body', persist, vi.fn());
    saver.update('previewed body');
    expect(await saver.flush()).toBe(true);
    expect(persist).toHaveBeenCalledExactlyOnceWith('previewed body');
    await saver.flush();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  test('flush waits for an in-flight save and then saves newer edits in order', async () => {
    let finish!: (result: { success: boolean }) => void;
    const persist = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue({ success: true });
    const saver = new Campaigns.DraftSaver<string>('initial', persist, vi.fn());
    saver.update('first edit');
    const autosave = saver.flush();
    saver.update('latest edit');
    const confirm = saver.flush();
    expect(confirm).toBe(autosave);
    expect(persist).toHaveBeenCalledTimes(1);
    finish({ success: true });
    expect(await confirm).toBe(true);
    expect(persist.mock.calls.map(([value]) => value)).toEqual(['first edit', 'latest edit']);
  });

  test.each(['validation', 'network'])('%s failure blocks confirmation and remains retryable', async (kind) => {
    const persist = vi.fn();
    if (kind === 'validation')
      persist.mockResolvedValueOnce({
        success: false,
        error: 'Invalid content',
      });
    else persist.mockRejectedValueOnce(new Error('Offline'));
    persist.mockResolvedValue({ success: true });
    const states: Campaigns.DraftSaveState[] = [];
    const saver = new Campaigns.DraftSaver<string>('initial', persist, (state) => states.push(state));
    saver.update('edited');
    expect(await saver.flush()).toBe(false);
    expect(states.at(-1)).toMatchObject({ kind: 'error' });
    expect(await saver.flush()).toBe(true);
    expect(persist).toHaveBeenLastCalledWith('edited');
    expect(states.at(-1)).toEqual({ kind: 'saved' });
  });
});
