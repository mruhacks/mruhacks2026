'use server';

import {
  unsubscribeByToken,
  type UnsubscribeOutcome,
} from '@/lib/campaigns/unsubscribe';

/** The page's one button. No session needed: the signed token is the authority. */
export async function unsubscribe(token: string): Promise<UnsubscribeOutcome> {
  return unsubscribeByToken(token);
}
