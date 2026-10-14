import type { Root, RootContent, PhrasingContent } from 'mdast';
import remarkDirective from 'remark-directive';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { CTA_DIRECTIVE, WALLET_DIRECTIVE } from './email-blocks';

/**
 * Campaign bodies are markdown from the editor's email profile, plus two
 * leaf directives for blocks that only make sense in email:
 *
 *   ::cta{label="Register now" href="https://…"}   a CtaButton
 *   ::wallet                                       the per-recipient wallet badges
 *
 * Both the HTML and the plain-text renderer walk the same parsed tree and
 * only ever emit the node types they know (an allowlist by construction), so
 * raw HTML, scripts, iframes, code blocks and tables never reach an email.
 */

const parser = unified().use(remarkParse).use(remarkDirective);

export function parseEmailMarkdown(markdown: string): Root {
  return parser.parse(markdown);
}

/** Only these link targets survive; anything else renders as plain text. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  return /^(https?:|mailto:)/i.test(trimmed) ? trimmed : null;
}

/**
 * Image sources must load from a mail client with no session: absolute
 * http(s) URLs, or our own `/api/assets/…` paths made absolute.
 */
export function safeImageSrc(
  url: string | null | undefined,
  baseUrl: string,
): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (/^https?:/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/api/assets/')) {
    return `${baseUrl.replace(/\/$/, '')}${trimmed}`;
  }
  return null;
}

export type CtaBlock = { label: string; href: string };

/** The CTA a `::cta` directive describes, or null when it's incomplete or unsafe. */
export function ctaFromNode(node: RootContent): CtaBlock | null {
  if (node.type !== 'leafDirective' || node.name !== CTA_DIRECTIVE) {
    return null;
  }
  const label = node.attributes?.label?.trim();
  const href = safeHref(node.attributes?.href);
  return label && href ? { label, href } : null;
}

export function isWalletBlock(node: RootContent): boolean {
  return node.type === 'leafDirective' && node.name === WALLET_DIRECTIVE;
}

export function hasWalletBlock(markdown: string): boolean {
  return parseEmailMarkdown(markdown).children.some(isWalletBlock);
}

/** Problems with the body's blocks that should stop it being sent. */
export function emailBlockErrors(markdown: string): string[] {
  const errors: string[] = [];
  for (const node of parseEmailMarkdown(markdown).children) {
    if (
      node.type === 'leafDirective' &&
      node.name === CTA_DIRECTIVE &&
      !ctaFromNode(node)
    ) {
      errors.push('Every button needs a label and an http(s) or mailto: link.');
    }
  }
  return [...new Set(errors)];
}

// ── Plain text ─────────────────────────────────────────────────────────────

function phrasingText(nodes: PhrasingContent[]): string {
  return nodes
    .map((node): string => {
      switch (node.type) {
        case 'text':
        case 'inlineCode':
          return node.value;
        case 'emphasis':
        case 'strong':
        case 'delete':
          return phrasingText(node.children);
        case 'link': {
          const text = phrasingText(node.children);
          const href = safeHref(node.url);
          return href && href !== text ? `${text} (${href})` : text;
        }
        case 'image':
          return node.alt ? `[${node.alt}]` : '';
        case 'break':
          return '\n';
        case 'textDirective':
          // `Note:this` parses as a directive; give the author their text back.
          return `:${node.name}${phrasingText(node.children)}`;
        default:
          return '';
      }
    })
    .join('');
}

function blockText(
  node: RootContent,
  render: (node: RootContent) => string | null,
): string | null {
  const custom = render(node);
  if (custom !== null) return custom;
  switch (node.type) {
    case 'paragraph':
      return phrasingText(node.children);
    case 'heading':
      return phrasingText(node.children).toUpperCase();
    case 'blockquote':
      return node.children
        .map((child) => blockText(child, render))
        .filter(Boolean)
        .join('\n\n')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'list':
      return node.children
        .map((item, i) => {
          const marker = node.ordered ? `${(node.start ?? 1) + i}.` : '-';
          const body = item.children
            .map((child) => blockText(child, render))
            .filter(Boolean)
            .join('\n')
            .replace(/\n/g, '\n   ');
          return `${marker} ${body}`;
        })
        .join('\n');
    case 'thematicBreak':
      return '---';
    case 'leafDirective': {
      const cta = ctaFromNode(node);
      return cta ? `${cta.label}: ${cta.href}` : null;
    }
    case 'code':
      return node.value;
    default:
      return null;
  }
}

/**
 * Plain-text version of an email body. `renderBlock` lets the caller
 * substitute per-recipient blocks (the wallet links) — return null to fall
 * back to the default.
 */
export function emailMarkdownToText(
  tree: Root,
  renderBlock: (node: RootContent) => string | null = () => null,
): string {
  return tree.children
    .map((node) => blockText(node, renderBlock))
    .filter((text): text is string => Boolean(text && text.trim()))
    .join('\n\n');
}
