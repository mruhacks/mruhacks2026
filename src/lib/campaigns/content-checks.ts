import 'server-only';

import { hasWalletBlock } from './email-markdown';
import { draftContentErrors, sendContentErrors, type Content } from './render-campaign-email';
import { walletBlockError } from './wallet-block';

/**
 * Everything that blocks a campaign, with the checks that need the database
 * (whether a wallet block is allowed) on top of the pure ones. Drafts are
 * held to fewer rules than a send.
 */
export async function contentErrors(
  content: Pick<Content, 'subject' | 'previewText' | 'bodyMarkdown'> & Partial<Content>,
  eventId: string | null,
  stage: 'draft' | 'send',
): Promise<string[]> {
  const errors = stage === 'send' ? sendContentErrors(content as Content) : draftContentErrors(content);
  if (hasWalletBlock(content.bodyMarkdown)) {
    const walletError = await walletBlockError(eventId);
    if (walletError) errors.push(walletError);
  }
  return errors;
}
