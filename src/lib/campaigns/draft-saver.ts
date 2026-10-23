export type DraftSaveState = { kind: 'saved' | 'dirty' | 'saving' } | { kind: 'error'; message: string };

export type DraftEditorHandle = { flush: () => Promise<boolean> };

/** Serializes autosaves and drains edits made during an in-flight save. */
export class DraftSaver<T> implements DraftEditorHandle {
  private current: T;
  private saved: T;
  private pending: Promise<boolean> | null = null;

  constructor(
    initial: T,
    private persist: (value: T) => Promise<{ success: boolean; error?: string }>,
    private report: (state: DraftSaveState) => void,
  ) {
    this.current = this.saved = initial;
  }

  update(value: T) {
    this.current = value;
    this.report({ kind: 'dirty' });
  }

  flush = (): Promise<boolean> => {
    if (this.pending) return this.pending;
    this.pending = this.drain().finally(() => {
      this.pending = null;
    });
    return this.pending;
  };

  private async drain(): Promise<boolean> {
    while (this.current !== this.saved) {
      const snapshot = this.current;
      this.report({ kind: 'saving' });
      try {
        const result = await this.persist(snapshot);
        if (!result.success) throw new Error(result.error ?? 'Could not save the draft.');
        this.saved = snapshot;
      } catch (error) {
        this.report({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not save the draft.',
        });
        return false;
      }
    }
    this.report({ kind: 'saved' });
    return true;
  }
}
