import { unstable_rethrow } from 'next/navigation';
import { fail, type ActionError } from '@/utils/action-result';

/** Preserve Next control-flow exceptions while keeping implementation details server-side. */
export function serverActionError(
  operation: string,
  error: unknown,
): ActionError {
  unstable_rethrow(error);
  console.error(`[action] ${operation} failed`, error);
  return fail(`Unable to ${operation}`);
}
