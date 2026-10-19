'use client';

import * as React from 'react';
import { hasSignedInHint } from '@/lib/signed-in-hint';

const subscribeNoop = () => () => {};
const getServerSnapshot = () => null;

/**
 * Whether this browser carries the signed-in hint cookie (see
 * `src/lib/signed-in-hint.ts`): null during SSR and the hydration render,
 * then a boolean. Components on public pages mount `authClient.useSession()`
 * only when this is true, so anonymous visitors never call
 * `/api/auth/get-session`.
 */
export function useSignedInHint(): boolean | null {
  return React.useSyncExternalStore(
    subscribeNoop,
    hasSignedInHint,
    getServerSnapshot,
  );
}
