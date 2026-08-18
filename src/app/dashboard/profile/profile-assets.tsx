'use client';

import * as React from 'react';
import { Download, FileText, Loader2, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { getOwnResume, removeResume } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const RESUME_ACCEPT =
  '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_RESUME_MB = 5;

type ProfileAssetsProps = {
  hasResume: boolean;
  resumeFileName: string | null;
  /**
   * A newly-picked resume file, held by the parent form. Nothing is
   * uploaded when the file is picked — the parent sends it to the server
   * (alongside the rest of the profile) when the form is submitted, since
   * the resume can only be attached once the profile row exists.
   */
  queuedResume: File | null;
  onQueueResume: (file: File | null) => void;
  /** True while the parent's own submit is in flight. */
  disabled?: boolean;
};

export function ProfileAssets({
  hasResume,
  resumeFileName,
  queuedResume,
  onQueueResume,
  disabled = false,
}: ProfileAssetsProps) {
  const router = useRouter();
  const resumeInputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState<'remove' | 'download' | null>(null);

  const busyOrDisabled = disabled || busy !== null;

  const selectFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_RESUME_MB * 1024 * 1024) {
      toast.error(`File must be smaller than ${MAX_RESUME_MB} MB.`);
      return;
    }
    onQueueResume(file);
    // Allow re-selecting the same file later (e.g. after clearing it).
    if (resumeInputRef.current) resumeInputRef.current.value = '';
  };

  const remove = async () => {
    setBusy('remove');
    const result = await removeResume();
    setBusy(null);
    if (!result.success) {
      toast.error(result.error ?? 'Unable to remove file.');
      return;
    }
    toast.success('Resume removed.');
    router.refresh();
  };

  const downloadResume = async () => {
    setBusy('download');
    const result = await getOwnResume();
    setBusy(null);
    if (!result.success || !result.data) {
      toast.error(
        result.success ? 'Resume is no longer available.' : result.error,
      );
      return;
    }
    const link = document.createElement('a');
    link.href = result.data.url;
    link.download = result.data.fileName;
    link.click();
  };

  return (
    <section className='border-border mb-8 space-y-3 border-b pb-8'>
      <p className='text-sm font-medium'>
        Resume{' '}
        <span className='text-muted-foreground font-normal'>(optional)</span>
      </p>
      <div className='flex min-h-10 items-center gap-2'>
        <Input
          ref={resumeInputRef}
          className='hidden'
          type='file'
          accept={RESUME_ACCEPT}
          onChange={(event) => selectFile(event.target.files?.[0])}
        />

        {queuedResume ? (
          <>
            <FileText className='text-muted-foreground size-4 shrink-0' />
            <span className='min-w-0 flex-1 truncate text-sm'>
              {queuedResume.name}
            </span>
            <span className='text-muted-foreground shrink-0 text-xs'>
              Will upload on save
            </span>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => onQueueResume(null)}
              disabled={busyOrDisabled}
            >
              <X className='size-4' />
              <span className='sr-only'>Cancel queued resume</span>
            </Button>
          </>
        ) : hasResume ? (
          <>
            <FileText className='text-muted-foreground size-4 shrink-0' />
            <span className='min-w-0 flex-1 truncate text-sm'>
              {resumeFileName ?? 'Resume'}
            </span>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={downloadResume}
              disabled={busyOrDisabled}
            >
              {busy === 'download' ? (
                <Loader2 className='size-4 animate-spin' />
              ) : (
                <Download className='size-4' />
              )}
              <span className='sr-only'>Download resume</span>
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => resumeInputRef.current?.click()}
              disabled={busyOrDisabled}
            >
              <Upload className='size-4' />
              <span className='sr-only'>Replace resume</span>
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={remove}
              disabled={busyOrDisabled}
            >
              {busy === 'remove' ? (
                <Loader2 className='size-4 animate-spin' />
              ) : (
                <Trash2 className='size-4' />
              )}
              <span className='sr-only'>Remove resume</span>
            </Button>
          </>
        ) : (
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => resumeInputRef.current?.click()}
            disabled={busyOrDisabled}
          >
            <Upload className='size-4' />
            Upload resume
          </Button>
        )}
      </div>
      <p className='text-muted-foreground text-xs'>
        PDF, DOC, or DOCX up to {MAX_RESUME_MB} MB.
        {queuedResume &&
          ' Not uploaded yet — it will be saved with the rest of this form.'}
      </p>
    </section>
  );
}
