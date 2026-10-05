import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

import {
  EMBED_IFRAME_ALLOW,
  EMBED_IFRAME_REFERRER_POLICY,
  EMBED_IFRAME_SANDBOX,
  getAllowedEmbedSrc,
  parseEmbedDimension,
} from '@/lib/embeds';
import { cn } from '@/lib/utils';
import {
  MARKDOWN_EMBED_SANITIZE_SCHEMA,
  MARKDOWN_SANITIZE_SCHEMA,
} from './sanitize-schema';

type TreeNode = { type: string; value?: unknown; children?: TreeNode[] };

const SELF_CLOSING_IFRAME = /<iframe\b([^>]*?)\s*\/>/gi;

/**
 * `<iframe … />` is JSX, not HTML: an HTML parser ignores the slash, leaves
 * the frame open, and swallows the rest of the document as fallback text.
 * The editor always writes the paired form, but an author typing in source
 * mode easily won't — so close any such tag before `rehype-raw` parses it.
 */
function rehypeCloseSelfClosingIframes() {
  const walk = (node: TreeNode) => {
    if (node.type === 'raw' && typeof node.value === 'string') {
      node.value = node.value.replace(
        SELF_CLOSING_IFRAME,
        '<iframe$1></iframe>',
      );
    }
    node.children?.forEach(walk);
  };
  return walk;
}

/**
 * Renders stored markdown (event descriptions, wiki articles) as read-only
 * content. Server-rendered — none of the editor's client bundle is involved.
 *
 * Raw HTML in the source *is* parsed, because the editor emits it: an image
 * the author resized cannot be expressed in `![]()` syntax, so MDXEditor
 * writes `<img width= height= src=>` instead. Escaping it would show authors
 * their own markup as text.
 *
 * Everything raw therefore goes through `rehype-sanitize` with an explicit
 * allow-list (see `./sanitize-schema`) — `rehype-raw` must run first so the
 * sanitizer sees real element nodes rather than an opaque `raw` node. Anything
 * outside the list, including `<script>` and every event-handler attribute, is
 * dropped before it reaches React.
 *
 * `allowRawHtml={false}` turns that off entirely, for surfaces whose authors
 * aren't organizers (project submissions): raw HTML is then dropped, not
 * parsed, and the editor for those surfaces never writes any (see
 * `MarkdownEditor`'s matching prop).
 *
 * `allowEmbeds` additionally lets `<iframe>` through, for surfaces whose
 * authors are allowed to embed (wiki articles). Even then a frame renders only
 * if its src is on the provider allow-list in `@/lib/embeds`, and it always
 * gets our fixed sandbox — never attributes from the source.
 */
export function MarkdownContent({
  markdown,
  className,
  allowEmbeds = false,
  allowRawHtml = true,
}: {
  markdown: string;
  className?: string;
  allowEmbeds?: boolean;
  allowRawHtml?: boolean;
}) {
  const embeds = allowEmbeds && allowRawHtml;
  return (
    <div className={cn('mdx-prose', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml={!allowRawHtml}
        rehypePlugins={[
          ...(allowRawHtml ? [rehypeCloseSelfClosingIframes, rehypeRaw] : []),
          [
            rehypeSanitize,
            embeds ? MARKDOWN_EMBED_SANITIZE_SCHEMA : MARKDOWN_SANITIZE_SCHEMA,
          ],
        ]}
        components={{
          // `node` is the hast node react-markdown hands to every custom
          // component. It is discarded rather than spread — left in, React
          // writes it to the DOM as `node="[object Object]"`. The rest of the
          // spread is kept so sanitizer-approved extras (width/height on a
          // resized image, title, aria-*) still reach the element.
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          a: ({ node: _node, href, children, ...props }) => (
            <a
              {...props}
              href={href}
              target={href?.startsWith('/') ? undefined : '_blank'}
              rel='noreferrer'
            >
              {children}
            </a>
          ),
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          img: ({ node: _node, src, alt, ...props }) => (
            // Attachments are served from `/api/assets`, which requires the
            // viewer's session cookie — the Next image optimizer fetches
            // server-side without one, so it can't be used here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              {...props}
              src={typeof src === 'string' ? src : undefined}
              alt={alt ?? ''}
              loading='lazy'
            />
          ),
          // Only reachable when `allowEmbeds` let the tag past the sanitizer.
          // Nothing is spread from the source: every attribute is rebuilt here
          // from the validated src/size, so author markup cannot widen the
          // sandbox or add `srcdoc`/`allow` even if the schema ever loosens.
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          iframe: ({ node: _node, src, title, width, height }) => {
            const embedSrc = embeds ? getAllowedEmbedSrc(src) : null;
            if (!embedSrc) return null;
            return (
              <iframe
                src={embedSrc}
                title={title || 'Embedded content'}
                width={parseEmbedDimension(width)}
                height={parseEmbedDimension(height)}
                sandbox={EMBED_IFRAME_SANDBOX}
                allow={EMBED_IFRAME_ALLOW}
                referrerPolicy={EMBED_IFRAME_REFERRER_POLICY}
                loading='lazy'
                allowFullScreen
              />
            );
          },
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
