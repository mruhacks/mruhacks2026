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
  directivesPlugin,
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
import {
  CTA_DIRECTIVE_DESCRIPTOR,
  InsertCtaButton,
  InsertWalletButton,
  WALLET_DIRECTIVE_DESCRIPTOR,
} from './email-blocks-plugin';

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
  /** Returns the URL to embed for an uploaded image. Without it, images are by URL only. */
  onUploadImage?: (file: File) => Promise<string>;
  /** Offer `<iframe>` embeds — only where the renderer also allows them. */
  allowEmbeds?: boolean;
  /**
   * `email` trims the editor to what campaign email can render: headings,
   * bold/italic, lists, links, quotes, rules, images and a CTA button block.
   * No embeds, code, tables, underline or raw-markdown source mode.
   */
  profile?: 'default' | 'email';
  /** Email profile: offer the per-recipient wallet block (the campaign's event must allow it). */
  allowWalletBlock?: boolean;
  placeholder?: string;
  className?: string;
};

export default function MarkdownEditorCore({
  markdown,
  onChange,
  onUploadImage,
  allowEmbeds = false,
  profile = 'default',
  allowWalletBlock = false,
  placeholder,
  className,
}: MarkdownEditorCoreProps) {
  if (profile === 'email') {
    return (
      <MDXEditor
        markdown={markdown}
        onChange={onChange}
        placeholder={placeholder}
        className={cn('bg-background rounded-md border', className)}
        contentEditableClassName='mdx-prose min-h-64'
        plugins={[
          headingsPlugin({ allowedHeadingLevels: [1, 2, 3] }),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          // Email clients ignore most sizing; the renderer sets the width.
          imagePlugin({
            imageUploadHandler: onUploadImage ?? null,
            disableImageResize: true,
          }),
          // Still registered so a pasted iframe is claimed and kept inert.
          embedPlugin({ enabled: false }),
          directivesPlugin({
            // The wallet descriptor is always registered so an existing
            // block stays editable (and removable) even where it's no
            // longer allowed; only inserting one is gated.
            directiveDescriptors: [
              CTA_DIRECTIVE_DESCRIPTOR,
              WALLET_DIRECTIVE_DESCRIPTOR,
            ],
          }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <UndoRedo />
                <Separator />
                <BoldItalicUnderlineToggles options={['Bold', 'Italic']} />
                <Separator />
                <ListsToggle options={['bullet', 'number']} />
                <Separator />
                <BlockTypeSelect />
                <Separator />
                <CreateLink />
                <InsertImage />
                <InsertThematicBreak />
                <Separator />
                <InsertCtaButton />
                {allowWalletBlock && <InsertWalletButton />}
              </>
            ),
          }),
        ]}
      />
    );
  }

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
        imagePlugin({ imageUploadHandler: onUploadImage ?? null }),
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
