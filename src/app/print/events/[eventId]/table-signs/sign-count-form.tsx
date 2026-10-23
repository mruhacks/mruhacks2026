'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import * as Judging from '@/lib/judging';

/**
 * How many signs to print. Kept in the URL (`?count=`), so the page renders
 * exactly what's asked for on the server; clearing the field goes back to
 * the tables handed out so far.
 */
export function SignCountForm({ count, handedOut }: { count: number; handedOut: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = React.useState(String(count));
  const [error, setError] = React.useState<string>();

  // Follow the server's count after navigating (Back, a reset).
  const [lastCount, setLastCount] = React.useState(count);
  if (count !== lastCount) {
    setLastCount(count);
    setValue(String(count));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed === '') {
      router.replace(pathname);
      return;
    }
    const next = Number(trimmed);
    if (!Number.isInteger(next) || next < 1 || next > Judging.MAX_TABLE_SIGNS) {
      setError(`Enter a whole number from 1 to ${Judging.MAX_TABLE_SIGNS}.`);
      return;
    }
    router.replace(next === handedOut ? pathname : `${pathname}?count=${next}`);
  }

  return (
    <form onSubmit={submit} className='flex flex-col gap-1'>
      <div className='flex items-center gap-2'>
        <label htmlFor='sign-count' className='text-sm font-medium'>
          Signs
        </label>
        <Input
          id='sign-count'
          type='number'
          inputMode='numeric'
          min={1}
          max={Judging.MAX_TABLE_SIGNS}
          step={1}
          className='h-9 w-24'
          aria-invalid={Boolean(error)}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(undefined);
          }}
        />
        <Button type='submit' variant='outline' disabled={value.trim() === String(count)}>
          Update
        </Button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </form>
  );
}
