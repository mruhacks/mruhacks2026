'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { createSavedAudience } from '@/app/dashboard/admin/campaigns/audience-actions';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function NewAudienceForm() {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    const result = await createSavedAudience({ name });
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.push(`/dashboard/admin/campaigns/audiences/${result.data!.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-1'>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <Input
          aria-label='New audience name'
          placeholder='New audience name, e.g. Past attendees'
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          className='sm:max-w-sm'
        />
        <Button type='submit' disabled={isSubmitting}>
          <Plus /> Create audience
        </Button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </form>
  );
}
