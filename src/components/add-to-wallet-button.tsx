import { Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function AddToWalletButton({
  eventId,
  className,
}: {
  eventId: string;
  className?: string;
}) {
  return (
    <Button
      asChild
      size='sm'
      className={cn('bg-black text-white hover:bg-black/85', className)}
    >
      <a href={`/api/wallet/pass/${eventId}`}>
        <Wallet className='size-4' />
        Add to Apple Wallet
      </a>
    </Button>
  );
}
