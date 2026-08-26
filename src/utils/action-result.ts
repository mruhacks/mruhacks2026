export interface ActionSuccess<T = unknown> {
  success: true;
  data?: T;
}

export interface ActionError {
  success: false;
  error: string;
}

/**
 * A standard result type for Next.js server actions.
 * Always returns a success indicator and optionally includes
 * data (on success) or an error message (on failure).
 */
export type ActionResult<T = unknown> = ActionSuccess<T> | ActionError;

/**
 * Helper functions for constructing responses
 */
export function ok<T>(data?: T): ActionSuccess<T> {
  return { success: true, data };
}

export function fail(error: string): ActionError {
  return { success: false, error };
}
