'use client';

import * as React from 'react';
import { Download, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import {
  getOwnResume,
  removeProfilePicture,
  removeResume,
  uploadProfilePicture,
  uploadResume,
} from './actions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ProfileAssetsProps = {
  image: string | null | undefined;
  name: string;
  hasResume: boolean;
  resumeFileName: string | null;
};

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

export function ProfileAssets({
  image,
  name,
  hasResume,
  resumeFileName,
}: ProfileAssetsProps) {
  const router = useRouter();
  const photoInputRef = React.useRef<HTMLInputElement>(null);
  const resumeInputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState<
    'photo' | 'resume' | 'download' | null
  >(null);

  const run = async (
    kind: 'photo' | 'resume',
    action: (
      formData: FormData,
    ) => Promise<{ success: boolean; error?: string }>,
    file: File | undefined,
    field: 'profilePicture' | 'resume',
  ) => {
    if (!file) return;
    const formData = new FormData();
    formData.set(field, file);
    setBusy(kind);
    const result = await action(formData);
    setBusy(null);
    if (!result.success) {
      toast.error(result.error ?? 'Upload failed.');
      return;
    }
    toast.success(
      kind === 'photo' ? 'Profile picture updated.' : 'Resume uploaded.',
    );
    router.refresh();
  };

  const remove = async (kind: 'photo' | 'resume') => {
    setBusy(kind);
    const result = await (kind === 'photo'
      ? removeProfilePicture()
      : removeResume());
    setBusy(null);
    if (!result.success) {
      toast.error(result.error ?? 'Unable to remove file.');
      return;
    }
    toast.success(
      kind === 'photo' ? 'Profile picture removed.' : 'Resume removed.',
    );
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
    link.href = result.data.dataUrl;
    link.download = result.data.fileName;
    link.click();
  };

  return (
    <section className='border-border mb-8 grid gap-6 border-b pb-8 sm:grid-cols-2'>
      <div className='space-y-3'>
        <p className='text-sm font-medium'>Profile picture</p>
        <div className='flex items-center gap-3'>
          <Avatar className='size-16'>
            {image && <AvatarImage src={image} alt={name} />}
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <div className='flex flex-wrap gap-2'>
            <Input
              ref={photoInputRef}
              className='hidden'
              type='file'
              accept='image/jpeg,image/png,image/webp'
              onChange={(event) =>
                run(
                  'photo',
                  uploadProfilePicture,
                  event.target.files?.[0],
                  'profilePicture',
                )
              }
            />
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => photoInputRef.current?.click()}
              disabled={busy !== null}
            >
              {busy === 'photo' ? (
                <Loader2 className='size-4 animate-spin' />
              ) : (
                <Upload className='size-4' />
              )}
              <span className='sr-only'>Upload profile picture</span>
            </Button>
            {image && (
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => remove('photo')}
                disabled={busy !== null}
              >
                <Trash2 className='size-4' />
                <span className='sr-only'>Remove profile picture</span>
              </Button>
            )}
          </div>
        </div>
        <p className='text-muted-foreground text-xs'>
          JPEG, PNG, or WebP up to 2 MB.
        </p>
      </div>

      <div className='space-y-3'>
        <p className='text-sm font-medium'>
          Resume{' '}
          <span className='text-muted-foreground font-normal'>(optional)</span>
        </p>
        <div className='flex min-h-10 items-center gap-2'>
          {hasResume ? (
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
                disabled={busy !== null}
              >
                {busy === 'download' ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <Download className='size-4' />
                )}
                <span className='sr-only'>Download resume</span>
              </Button>
              <Input
                ref={resumeInputRef}
                className='hidden'
                type='file'
                accept='.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                onChange={(event) =>
                  run('resume', uploadResume, event.target.files?.[0], 'resume')
                }
              />
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => resumeInputRef.current?.click()}
                disabled={busy !== null}
              >
                <Upload className='size-4' />
                <span className='sr-only'>Replace resume</span>
              </Button>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => remove('resume')}
                disabled={busy !== null}
              >
                <Trash2 className='size-4' />
                <span className='sr-only'>Remove resume</span>
              </Button>
            </>
          ) : (
            <>
              <Input
                ref={resumeInputRef}
                className='hidden'
                type='file'
                accept='.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                onChange={(event) =>
                  run('resume', uploadResume, event.target.files?.[0], 'resume')
                }
              />
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => resumeInputRef.current?.click()}
                disabled={busy !== null}
              >
                {busy === 'resume' ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <Upload className='size-4' />
                )}
                Upload resume
              </Button>
            </>
          )}
        </div>
        <p className='text-muted-foreground text-xs'>
          PDF, DOC, or DOCX up to 5 MB.
        </p>
      </div>
    </section>
  );
}
