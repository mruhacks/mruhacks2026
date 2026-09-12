import type { ActionResult } from '@/utils/action-result';

/** Unwraps a successful ActionResult in test setup code, throwing the action's error otherwise. */
export function unwrap<T>(result: ActionResult<T>): T {
  if (!result.success) throw new Error(result.error);
  return result.data as T;
}
