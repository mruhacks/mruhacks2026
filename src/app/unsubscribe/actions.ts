'use server';

import * as Campaigns from '@/lib/campaigns/server';

/** The page's one button. No session needed: the signed token is the authority. */
export async function unsubscribe(token: string): Promise<Campaigns.UnsubscribeOutcome> {
  return Campaigns.unsubscribeByToken(token);
}
