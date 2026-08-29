'use client';

import * as React from 'react';
import { Download, FileText, Loader2, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { getOwnResume, removeResume } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

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
  const [isDragOver, setIsDragOver] = React.useState(false);

  const busyOrDisabled = disabled || busy !== null;

  const selectFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_RESUME_MB * 1024 * 1024) {
      toast.error(`File must be smaller than ${MAX_RESUME_MB} MB.`);
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    const allowed = ['pdf', 'doc', 'docx'];
    if (!ext || !allowed.includes(ext)) {
      toast.error('Only PDF, DOC, or DOCX files are accepted.');
      return;
    }
    onQueueResume(file);
    if (resumeInputRef.current) resumeInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!busyOrDisabled) setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (busyOrDisabled) return;
    selectFile(e.dataTransfer.files[0]);
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

  const showDropZone = !queuedResume && !hasResume;

  return (
    <section className='border-border mb-8 space-y-3 border-b pb-8'>
      <p className='text-sm font-medium'>
        Resume{' '}
        <span className='text-muted-foreground font-normal'>(optional)</span>
      </p>

      <Input
        ref={resumeInputRef}
        className='hidden'
        type='file'
        accept={RESUME_ACCEPT}
        onChange={(event) => selectFile(event.target.files?.[0])}
      />

      {/* Desktop drag-and-drop zone — shown when no resume is queued or saved */}
      {showDropZone && (
        <div
          className={cn(
            'hidden cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors md:flex',
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/40',
            busyOrDisabled && 'pointer-events-none opacity-50',
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !busyOrDisabled && resumeInputRef.current?.click()}
          role='button'
          tabIndex={0}
          aria-label='Upload resume — drag and drop or click to browse'
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              resumeInputRef.current?.click();
            }
          }}
        >
          <Upload className='text-muted-foreground size-6' />
          <div>
            <p className='text-sm font-medium'>
              Drag &amp; drop your resume here
            </p>
            <p className='text-muted-foreground text-xs'>
              or{' '}
              <span className='text-primary underline underline-offset-2'>
                click to browse
              </span>
            </p>
          </div>
          <p className='text-muted-foreground text-xs'>
            PDF, DOC, or DOCX up to {MAX_RESUME_MB} MB
          </p>
        </div>
      )}

      {/* Mobile upload button — shown when no resume is queued or saved */}
      {showDropZone && (
        <div className='flex min-h-10 items-center gap-2 md:hidden'>
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
        </div>
      )}

      {/* Queued file row */}
      {queuedResume && (
        <div className='flex min-h-10 items-center gap-2'>
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
        </div>
      )}

      {/* Saved resume row */}
      {hasResume && !queuedResume && (
        <div className='flex min-h-10 items-center gap-2'>
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
        </div>
      )}

      <p className='text-muted-foreground text-xs'>
        PDF, DOC, or DOCX up to {MAX_RESUME_MB} MB.
        {queuedResume &&
          ' Not uploaded yet — it will be saved with the rest of this form.'}
      </p>
    </section>
  );
}
