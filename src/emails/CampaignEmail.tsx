import React from 'react';
import { Heading, Hr, Img, Link, Text } from 'react-email';
import type { Root, RootContent, PhrasingContent } from 'mdast';

import * as Campaigns from '@/lib/campaigns';
import { campaignImageWidth } from '@/utils/object-storage';
import { CtaButton, EmailLayout } from '@/emails/EmailLayout';

/** Widest an image is drawn: the body column of the 600px layout, minus padding. */
const EMAIL_IMAGE_MAX_WIDTH = 520;

type Props = {
  tree: Root;
  preview: string;
  baseUrl: string;
  /** Marketing unsubscribe line, or the operational "you're receiving this because…" line. */
  footer?: React.ReactNode;
  /** Per-recipient blocks (the wallet badges); return undefined to use the default. */
  renderBlock?: (node: RootContent) => React.ReactNode | undefined;
};

/**
 * A campaign email: the parsed markdown body inside the shared layout. Only
 * the node types handled below are ever rendered — raw HTML, code, tables,
 * embeds and unknown directives are dropped.
 */
export function CampaignEmail({ tree, preview, baseUrl, footer, renderBlock }: Props) {
  const ctx: RenderContext = { baseUrl, renderBlock };
  return (
    <EmailLayout preview={preview} baseUrl={baseUrl} footer={footer}>
      {tree.children.map((node, i) => renderBlockNode(node, i, ctx))}
    </EmailLayout>
  );
}

type RenderContext = {
  baseUrl: string;
  renderBlock?: Props['renderBlock'];
};

function renderPhrasing(nodes: PhrasingContent[], ctx: RenderContext): React.ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
      case 'inlineCode':
        return node.value;
      case 'strong':
        return <strong key={i}>{renderPhrasing(node.children, ctx)}</strong>;
      case 'emphasis':
        return <em key={i}>{renderPhrasing(node.children, ctx)}</em>;
      case 'delete':
        return <s key={i}>{renderPhrasing(node.children, ctx)}</s>;
      case 'break':
        return <br key={i} />;
      case 'link': {
        const href = Campaigns.safeHref(node.url);
        const children = renderPhrasing(node.children, ctx);
        return href ? (
          <Link key={i} href={href} style={link}>
            {children}
          </Link>
        ) : (
          <React.Fragment key={i}>{children}</React.Fragment>
        );
      }
      case 'image': {
        const src = Campaigns.safeImageSrc(node.url, ctx.baseUrl);
        if (!src) return null;
        // Our uploads record their pixel width; draw them no wider than the
        // column (a 1200px upload is a 2x image for it) and never upscaled.
        // An external image's size is unknown, so it's only capped by CSS.
        const stored = campaignImageWidth(node.url);
        const width = stored ? Math.min(stored, EMAIL_IMAGE_MAX_WIDTH) : undefined;
        return <Img key={i} src={src} alt={node.alt ?? ''} width={width} style={image} />;
      }
      case 'textDirective':
        return (
          <React.Fragment key={i}>
            :{node.name}
            {renderPhrasing(node.children, ctx)}
          </React.Fragment>
        );
      default:
        return null;
    }
  });
}

function renderBlockNode(node: RootContent, key: number, ctx: RenderContext): React.ReactNode {
  const custom = ctx.renderBlock?.(node);
  if (custom !== undefined) {
    return <React.Fragment key={key}>{custom}</React.Fragment>;
  }

  switch (node.type) {
    case 'paragraph':
      return (
        <Text key={key} style={body}>
          {renderPhrasing(node.children, ctx)}
        </Text>
      );
    case 'heading': {
      const level = Math.min(node.depth, 3) as 1 | 2 | 3;
      return (
        <Heading key={key} as={`h${level}`} style={headings[level]}>
          {renderPhrasing(node.children, ctx)}
        </Heading>
      );
    }
    case 'blockquote':
      return (
        <div key={key} style={quote}>
          {node.children.map((child, i) => renderBlockNode(child, i, ctx))}
        </div>
      );
    case 'list': {
      const ListTag = node.ordered ? 'ol' : 'ul';
      return (
        <ListTag
          key={key}
          style={list}
          {...(node.ordered && node.start && node.start !== 1 ? { start: node.start } : {})}
        >
          {node.children.map((item, i) => (
            <li key={i} style={listItem}>
              {item.children.map((child, j) =>
                // Tight list items are bare paragraphs; don't give them
                // paragraph margins.
                child.type === 'paragraph' ? (
                  <React.Fragment key={j}>{renderPhrasing(child.children, ctx)}</React.Fragment>
                ) : (
                  renderBlockNode(child, j, ctx)
                ),
              )}
            </li>
          ))}
        </ListTag>
      );
    }
    case 'thematicBreak':
      return <Hr key={key} style={rule} />;
    case 'leafDirective': {
      const cta = Campaigns.ctaFromNode(node);
      return cta ? <CtaButton key={key} label={cta.label} url={cta.href} /> : null;
    }
    case 'code':
      return (
        <Text key={key} style={body}>
          {node.value}
        </Text>
      );
    default:
      return null;
  }
}

const font = 'Arial,Helvetica,sans-serif';
const body = {
  margin: '0 0 14px',
  fontFamily: font,
  fontSize: 15,
  lineHeight: '1.7',
  color: '#333333',
};
const headings = {
  1: {
    margin: '0 0 20px',
    fontFamily: font,
    fontWeight: 600,
    fontSize: 22,
    lineHeight: '1.35',
    color: '#000000',
  },
  2: {
    margin: '24px 0 12px',
    fontFamily: font,
    fontWeight: 600,
    fontSize: 18,
    lineHeight: '1.4',
    color: '#000000',
  },
  3: {
    margin: '20px 0 10px',
    fontFamily: font,
    fontWeight: 600,
    fontSize: 16,
    lineHeight: '1.4',
    color: '#000000',
  },
} as const;
const link = { color: '#4d75ee', textDecoration: 'underline' };
const image = {
  display: 'block',
  maxWidth: '100%',
  height: 'auto',
  margin: '8px 0 16px',
  borderRadius: 8,
};
const quote = {
  margin: '0 0 14px',
  padding: '4px 0 4px 16px',
  borderLeft: '3px solid #d0d0d0',
};
const list = {
  margin: '0 0 14px',
  paddingLeft: 24,
  fontFamily: font,
  fontSize: 15,
  lineHeight: '1.7',
  color: '#333333',
};
const listItem = { margin: '0 0 4px' };
const rule = { borderColor: '#e5e5e5', margin: '24px 0' };
