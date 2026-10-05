'use client';

/**
 * The actual MDX editor. Kept in its own module so `markdown-editor.tsx` can
 * pull it in with `ssr: false` — MDXEditor is built on Lexical, which reaches
 * for `window` on mount and cannot be prerendered.
 */

import * as React from 'react';
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ChangeCodeMirrorLanguage,
  CodeToggle,
  ConditionalContents,
  CreateLink,
  DiffSourceToggleWrapper,
  InsertCodeBlock,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  Separator,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';

import { cn } from '@/lib/utils';
import { InsertEmbed, embedPlugin } from './embed-plugin';

/** Languages offered in the code-block dropdown. */
const CODE_BLOCK_LANGUAGES = {
  text: 'Plain text',
  bash: 'Shell',
  json: 'JSON',
  js: 'JavaScript',
  ts: 'TypeScript',
  tsx: 'TSX',
  python: 'Python',
  sql: 'SQL',
  css: 'CSS',
  html: 'HTML',
};

export type MarkdownEditorCoreProps = {
  /** Read once on mount; later changes are ignored (MDXEditor is uncontrolled). */
  markdown: string;
  onChange: (markdown: string) => void;
  /** Returns the URL to embed for an uploaded image. */
  onUploadImage: (file: File) => Promise<string>;
  /** Offer `<iframe>` embeds — only where the renderer also allows them. */
  allowEmbeds?: boolean;
  /** Allow raw HTML output (resized images) — see `MarkdownEditor`. */
  allowRawHtml?: boolean;
  placeholder?: string;
  className?: string;
};

export default function MarkdownEditorCore({
  markdown,
  onChange,
  onUploadImage,
  allowEmbeds = false,
  allowRawHtml = true,
  placeholder,
  className,
}: MarkdownEditorCoreProps) {
  return (
    <MDXEditor
      markdown={markdown}
      onChange={onChange}
      placeholder={placeholder}
      className={cn('bg-background rounded-md border', className)}
      contentEditableClassName='mdx-prose min-h-64'
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        linkPlugin(),
        linkDialogPlugin(),
        tablePlugin(),
        imagePlugin({
          imageUploadHandler: onUploadImage,
          // A resized image can only be written as `<img width height>`.
          disableImageResize: !allowRawHtml,
        }),
        // Always registered, even when embeds are off — see `./embed-plugin`.
        embedPlugin({ enabled: allowEmbeds }),
        codeBlockPlugin({ defaultCodeBlockLanguage: 'text' }),
        codeMirrorPlugin({ codeBlockLanguages: CODE_BLOCK_LANGUAGES }),
        markdownShortcutPlugin(),
        // Lets an author drop into raw markdown — useful for pasting a table
        // or fixing something the rich-text surface makes awkward.
        diffSourcePlugin({ viewMode: 'rich-text', diffMarkdown: markdown }),
        toolbarPlugin({
          toolbarContents: () => (
            <ConditionalContents
              options={[
                {
                  when: (editor) => editor?.editorType === 'codeblock',
                  contents: () => <ChangeCodeMirrorLanguage />,
                },
                {
                  fallback: () => (
                    <DiffSourceToggleWrapper>
                      <UndoRedo />
                      <Separator />
                      <BoldItalicUnderlineToggles />
                      <CodeToggle />
                      <Separator />
                      <ListsToggle />
                      <Separator />
                      <BlockTypeSelect />
                      <Separator />
                      <CreateLink />
                      <InsertImage />
                      {allowEmbeds && <InsertEmbed />}
                      <Separator />
                      <InsertTable />
                      <InsertThematicBreak />
                      <InsertCodeBlock />
                    </DiffSourceToggleWrapper>
                  ),
                },
              ]}
            />
          ),
        }),
      ]}
    />
  );
}
