'use client';

/**
 * Replaces MDXEditor's built-in image dialog, which also offers "add an image
 * from a URL". Images may only come from our own uploads: the CSP blocks
 * third-party image hosts, so a pasted URL would look fine to the author
 * and render broken for every reader. Editing an existing image only changes
 * its alt text; its source stays as uploaded.
 */

import * as React from 'react';
import { closeImageDialog$, imageDialogState$, imageUploadHandler$, saveImage$ } from '@mdxeditor/editor';
import { useCellValues, usePublisher } from '@mdxeditor/gurx';
import { ImageUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { imageUploadError } from '@/lib/image-attachments';
import { cn } from '@/lib/utils';

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

export function ImageDialog() {
  const [state, uploadImage] = useCellValues(imageDialogState$, imageUploadHandler$);
  const saveImage = usePublisher(saveImage$);
  const closeImageDialog = usePublisher(closeImageDialog$);

  if (state.type === 'inactive') return null;
  return (
    <ImageDialogForm
      // Remount per open so the fields start from this image's values.
      key={state.type === 'editing' ? state.nodeKey : 'new'}
      editing={state.type === 'editing' ? state.initialValues : null}
      uploadImage={uploadImage}
      onSave={saveImage}
      onClose={closeImageDialog}
    />
  );
}

function ImageDialogForm({
  editing,
  uploadImage,
  onSave,
  onClose,
}: {
  editing: { src?: string; altText?: string } | null;
  uploadImage: ((file: File) => Promise<string>) | null;
  onSave: (values: { src: string; altText: string }) => void;
  onClose: () => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [altText, setAltText] = React.useState(editing?.altText ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  /** Checks a picked or dropped file up front, so the error shows at once. */
  function selectFile(next: File | undefined) {
    if (!next) return;
    const invalid = imageUploadError(next);
    setFile(invalid ? null : next);
    setError(invalid);
  }

  async function handleSubmit(event: React.FormEvent) {
    // The dialog is portalled out of the DOM, but React still bubbles its
    // submit event to the form that hosts the editor.
    event.preventDefault();
    event.stopPropagation();

    let src = editing?.src;
    if (!editing) {
      if (!file) return setError('Choose an image to upload.');
      if (!uploadImage) return setError('Image uploads are not available.');

      setIsUploading(true);
      try {
        src = await uploadImage(file);
      } catch (uploadFailure) {
        // `MarkdownEditor`'s handler rejects with a reason fit to show.
        setError(uploadFailure instanceof Error ? uploadFailure.message : 'Unable to upload that image.');
        return;
      } finally {
        setIsUploading(false);
      }
    }
    if (!src) return;
    onSave({ src, altText: altText.trim() });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isUploading) onClose();
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit} className='space-y-4'>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit image' : 'Upload an image'}</DialogTitle>
            {!editing && <DialogDescription>JPEG, PNG, WebP, GIF or AVIF, up to 5 MB.</DialogDescription>}
          </DialogHeader>
          {!editing && (
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor='image-file'>Image</FieldLabel>
              <input
                ref={fileInput}
                id='image-file'
                type='file'
                accept={ACCEPTED_TYPES}
                className='sr-only'
                onChange={(event) => {
                  selectFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              <div
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
                  isDragOver
                    ? 'border-primary bg-primary/5'
                    : error
                      ? 'border-destructive'
                      : 'border-border hover:border-primary/50 hover:bg-muted/40',
                  isUploading && 'pointer-events-none opacity-50',
                )}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!isUploading) setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragOver(false);
                  if (!isUploading) selectFile(event.dataTransfer.files[0]);
                }}
                onClick={() => fileInput.current?.click()}
                role='button'
                tabIndex={0}
                aria-label='Choose an image — drag and drop or click to browse'
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    fileInput.current?.click();
                  }
                }}
              >
                <ImageUp className='text-muted-foreground size-6' />
                {file ? (
                  <p className='max-w-full truncate text-sm font-medium'>{file.name}</p>
                ) : (
                  <div>
                    <p className='text-sm font-medium'>Drag &amp; drop an image here</p>
                    <p className='text-muted-foreground text-xs'>
                      or <span className='text-primary underline underline-offset-2'>click to browse</span>
                    </p>
                  </div>
                )}
              </div>
              {error && <FieldError>{error}</FieldError>}
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor='image-alt'>Alt text (for screen readers)</FieldLabel>
            <Input id='image-alt' value={altText} onChange={(event) => setAltText(event.target.value)} />
          </Field>
          <DialogFooter>
            <Button type='submit' disabled={isUploading}>
              {isUploading ? 'Uploading…' : editing ? 'Save' : 'Insert'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
