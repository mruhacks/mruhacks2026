'use client';

import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Props = { code: string };

export function TeamCodeDisplay({ code }: Props) {
  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    toast.success('Code copied');
  };

  return (
    <div className='flex items-center justify-between gap-3 rounded-md border p-4'>
      <div>
        <p className='text-muted-foreground text-xs font-semibold uppercase'>
          Team code
        </p>
        <p className='font-mono text-3xl font-bold tracking-widest'>{code}</p>
      </div>
      <Button
        type='button'
        variant='outline'
        size='icon'
        onClick={copyCode}
        aria-label='Copy team code'
      >
        <Copy className='size-4' />
      </Button>
    </div>
  );
}
