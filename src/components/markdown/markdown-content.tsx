import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

import { cn } from '@/lib/utils';
import { MARKDOWN_SANITIZE_SCHEMA } from './sanitize-schema';

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
 */
export function MarkdownContent({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  return (
    <div className={cn('mdx-prose', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA]]}
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
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
