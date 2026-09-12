'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';

import { Skeleton } from '@/components/ui/skeleton';
import type { ActionResult } from '@/utils/action-result';

/**
 * MDXEditor bundles Lexical, which touches `window` while mounting, so the
 * editor can only ever run in the browser. Loading it here (rather than at the
 * page level) also keeps its bundle out of routes that merely *render*
 * markdown.
 */
const MarkdownEditorCore = dynamic(() => import('./markdown-editor-core'), {
  ssr: false,
  loading: () => <Skeleton className='h-72 w-full rounded-md' />,
});

export type MarkdownEditorProps = {
  /**
   * Initial markdown. The editor is uncontrolled — it reads this once on
   * mount — so change it only alongside a `key` change on this component.
   */
  value: string;
  onChange: (markdown: string) => void;
  /**
   * Server action that stores an attachment and returns the URL to embed.
   * Each caller passes the action carrying the permission check for *its*
   * feature, so the editor never has to know who is allowed to upload.
   */
  uploadAttachment: (
    formData: FormData,
  ) => Promise<ActionResult<{ url: string }>>;
  /**
   * Called with a human-readable reason when an image upload fails, so the
   * host form can show it inline next to the editor.
   */
  onUploadError?: (message: string) => void;
  placeholder?: string;
  className?: string;
};

export function MarkdownEditor({
  value,
  onChange,
  uploadAttachment,
  onUploadError,
  placeholder,
  className,
}: MarkdownEditorProps) {
  const handleUpload = React.useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const result = await uploadAttachment(formData);
      if (!result.success) {
        onUploadError?.(result.error);
        // MDXEditor keeps the image dialog open on a rejection, which leaves
        // the author where they can retry after reading the error.
        throw new Error(result.error);
      }
      if (!result.data) {
        const message = 'Upload succeeded but returned no image URL.';
        onUploadError?.(message);
        throw new Error(message);
      }
      return result.data.url;
    },
    [uploadAttachment, onUploadError],
  );

  return (
    <MarkdownEditorCore
      markdown={value}
      onChange={onChange}
      onUploadImage={handleUpload}
      placeholder={placeholder}
      className={className}
    />
  );
}
