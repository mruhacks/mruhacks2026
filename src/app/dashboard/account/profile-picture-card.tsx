'use client';

import * as React from 'react';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import {
  removeProfilePicture,
  uploadProfilePicture,
} from '@/app/dashboard/profile/actions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getInitials } from '@/lib/initials';

type ProfilePictureCardProps = {
  image: string | null | undefined;
  name: string;
};

export function ProfilePictureCard({ image, name }: ProfilePictureCardProps) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const formData = new FormData();
    formData.set('profilePicture', file);
    setBusy(true);
    const result = await uploadProfilePicture(formData);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error ?? 'Upload failed.');
      return;
    }
    toast.success('Profile picture updated.');
    router.refresh();
  };

  const remove = async () => {
    setBusy(true);
    const result = await removeProfilePicture();
    setBusy(false);
    if (!result.success) {
      toast.error(result.error ?? 'Unable to remove picture.');
      return;
    }
    toast.success('Profile picture removed.');
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile picture</CardTitle>
        <CardDescription>JPEG, PNG, or WebP up to 2 MB.</CardDescription>
      </CardHeader>
      <CardContent className='flex items-center gap-3'>
        <Avatar className='size-16'>
          {image && <AvatarImage src={image} alt={name} />}
          <AvatarFallback>{getInitials(name)}</AvatarFallback>
        </Avatar>
        <div className='flex flex-wrap gap-2'>
          <Input
            ref={inputRef}
            className='hidden'
            type='file'
            accept='image/jpeg,image/png,image/webp'
            onChange={(event) => upload(event.target.files?.[0])}
          />
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? (
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
              onClick={remove}
              disabled={busy}
            >
              <Trash2 className='size-4' />
              <span className='sr-only'>Remove profile picture</span>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
