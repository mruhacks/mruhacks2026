import 'server-only';

import React from 'react';
import { Link } from 'react-email';
import { render } from 'react-email';
import type { RootContent } from 'mdast';

import { CampaignEmail } from '@/emails/CampaignEmail';
import type { Type } from './constants';
import { emailBlockErrors, emailMarkdownToText, parseEmailMarkdown } from './email-markdown';
import { applyMergeFields, mergeFieldError } from './merge-fields';

/** Absolute origin links and images in email point at. */
export function getAppBaseUrl(): string {
  const url = process.env.BETTER_AUTH_URL?.trim();
  if (!url) throw new Error('BETTER_AUTH_URL is required to build email links');
  return url.replace(/\/$/, '');
}

export type Content = {
  type: Type;
  subject: string;
  previewText: string;
  bodyMarkdown: string;
  /** The campaign's event, named in the operational footer. */
  eventName: string | null;
};

export type Recipient = {
  firstName: string | null;
  /** Signed one-click unsubscribe link (marketing only). */
  unsubscribeUrl?: string | null;
};

/** Per-recipient replacements for directive blocks, e.g. the wallet badges. */
export type BlockRenderers = {
  html?: (node: RootContent) => React.ReactNode | undefined;
  text?: (node: RootContent) => string | null;
};

const footerLink = { color: '#ffffff', textDecoration: 'underline' };

function footerFor(content: Content, recipient: Recipient, baseUrl: string): { html: React.ReactNode; text: string } {
  if (content.type === 'operational') {
    const because = content.eventName
      ? `You're receiving this because you registered for ${content.eventName}.`
      : "You're receiving this because you registered for an MRUHacks event.";
    return { html: because, text: because };
  }
  const because = "You're receiving this because you opted into email from MRUHacks.";
  // Previews have no signed link; they point at the account page instead so
  // the footer still reads exactly as it will when sent.
  const href = recipient.unsubscribeUrl ?? `${baseUrl}/dashboard/account`;
  const label = 'Unsubscribe';
  return {
    html: React.createElement(
      React.Fragment,
      null,
      `${because} `,
      React.createElement(Link, { href, style: footerLink }, label),
    ),
    text: `${because}\n${label}: ${href}`,
  };
}

/**
 * Everything that has to be fixed before a campaign can be sent. Drafts are
 * only held to the merge-field rule (`draftContentErrors`).
 */
export function sendContentErrors(content: Content): string[] {
  const errors = draftContentErrors(content);
  if (!content.subject.trim()) errors.unshift('Add a subject line.');
  if (!content.bodyMarkdown.trim()) errors.push('Write the email body.');
  errors.push(...emailBlockErrors(content.bodyMarkdown));
  return errors;
}

/** Problems that block even saving a draft: unknown `{{…}}` merge fields. */
export function draftContentErrors(content: Pick<Content, 'subject' | 'previewText' | 'bodyMarkdown'>): string[] {
  return [
    mergeFieldError(content.subject),
    mergeFieldError(content.previewText),
    mergeFieldError(content.bodyMarkdown),
  ].filter((error): error is string => error !== null);
}

/**
 * Renders one recipient's copy of a campaign: subject, HTML inside the shared
 * EmailLayout, and a plain-text version from the same parsed markdown.
 */
export async function renderCampaignEmail(
  content: Content,
  recipient: Recipient,
  options: { baseUrl?: string; blocks?: BlockRenderers } = {},
): Promise<{ subject: string; html: string; text: string }> {
  const baseUrl = options.baseUrl ?? getAppBaseUrl();
  const values = { firstName: recipient.firstName };
  const tree = parseEmailMarkdown(applyMergeFields(content.bodyMarkdown, values, { escapeMarkdown: true }));
  const subject = applyMergeFields(content.subject, values).trim();
  const preview = applyMergeFields(content.previewText, values).trim();
  const footer = footerFor(content, recipient, baseUrl);

  const html = await render(
    React.createElement(CampaignEmail, {
      tree,
      preview: preview || subject,
      baseUrl,
      footer: footer.html,
      renderBlock: options.blocks?.html,
    }),
  );
  const body = emailMarkdownToText(tree, options.blocks?.text);
  const text = `${body}\n\n—\n${footer.text}\n`;

  return { subject, html, text };
}
