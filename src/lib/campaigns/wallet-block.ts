import 'server-only';

import React from 'react';
import { Column, Img, Link, Row, Section } from 'react-email';
import { and, eq, isNull } from 'drizzle-orm';

import * as schema from '@/db/schema';
import * as Signing from '@/lib/signing/server';
import * as Wallet from '@/lib/wallet/server';
import { db } from '@/utils/db';
import { isWalletBlock } from './email-markdown';
import type { BlockRenderers } from './render-campaign-email';
import { WALLET_BADGE_PATHS } from './wallet-badges';

/**
 * The optional `::wallet` block: "Add to Apple Wallet" / "Add to Google
 * Wallet" badges whose links are signed per recipient
 * (`/api/wallet/email/<token>?platform=…`), so the pass is added with no
 * sign-in. Eligibility is checked again when the link is clicked.
 */

/** Rendered height; widths keep each badge's own aspect ratio (304×96 and 347×96 at 2x). */
const BADGE_HEIGHT = 40;
const BADGE_WIDTHS = { apple: 127, google: 145 } as const;

export type WalletLinks = { apple: string; google: string };

/**
 * Why a campaign can't carry a wallet block, or null when it can: it needs
 * an event context that's a top-level event with check-in on.
 */
export async function walletBlockError(eventId: string | null): Promise<string | null> {
  const message = 'The wallet block needs the campaign to be about an event with check-in turned on.';
  if (!eventId) return message;
  const [row] = await db
    .select({ checkInEnabled: schema.events.checkInEnabled })
    .from(schema.events)
    .where(and(eq(schema.events.id, eventId), isNull(schema.events.parentEventId)))
    .limit(1);
  return row?.checkInEnabled ? null : message;
}

/**
 * A recipient's signed wallet links, or null when they don't currently hold
 * a spot (or the event has ended) — they get the email without the block.
 */
export async function walletLinksFor(
  userId: string,
  eventId: string,
  baseUrl: string,
  now: Date = new Date(),
): Promise<WalletLinks | null> {
  const participation = await Wallet.participation(eventId, userId);
  if (!participation) return null;
  if (participation.endsAt && participation.endsAt.getTime() < now.getTime()) {
    return null;
  }
  const token = await Signing.buildWalletLinkToken(userId, eventId);
  const url = `${baseUrl}/api/wallet/email/${token}`;
  return { apple: `${url}?platform=apple`, google: `${url}?platform=google` };
}

function badge(platform: 'apple' | 'google', href: string, baseUrl: string): React.ReactNode {
  return React.createElement(
    Link,
    { href },
    React.createElement(Img, {
      src: `${baseUrl}${WALLET_BADGE_PATHS[platform]}`,
      alt: platform === 'apple' ? 'Add to Apple Wallet' : 'Add to Google Wallet',
      width: BADGE_WIDTHS[platform],
      height: BADGE_HEIGHT,
      style: { display: 'block' },
    }),
  );
}

/**
 * Renderers for the `::wallet` block. `links: null` drops the block (a
 * recipient without a held spot); `'placeholder'` shows the badges with
 * inert links, for the composer's preview.
 */
export function walletBlockRenderers(links: WalletLinks | 'placeholder' | null, baseUrl: string): BlockRenderers {
  const hrefs = links === 'placeholder' ? { apple: '#', google: '#' } : links;
  return {
    html: (node) => {
      if (!isWalletBlock(node)) return undefined;
      if (!hrefs) return null;
      return React.createElement(
        Section,
        { style: { margin: '20px 0' } },
        React.createElement(
          Row,
          null,
          React.createElement(
            Column,
            { style: { width: BADGE_WIDTHS.apple + 12 } },
            badge('apple', hrefs.apple, baseUrl),
          ),
          React.createElement(Column, null, badge('google', hrefs.google, baseUrl)),
        ),
      );
    },
    text: (node) => {
      if (!isWalletBlock(node)) return null;
      if (!hrefs) return '';
      return `Add to Apple Wallet: ${hrefs.apple}\nAdd to Google Wallet: ${hrefs.google}`;
    },
  };
}
