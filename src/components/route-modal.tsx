'use client';

import { useRouter } from 'next/navigation';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * Renders an intercepted route as a modal: always open, and "closing" it
 * (Escape, overlay click, or the X) navigates back instead of toggling
 * local state — the modal's open/closed-ness *is* the current route.
 */
export function RouteModal({
  title,
  children,
  className,
}: {
  /** Accessible name for the dialog; visually hidden since the content has its own heading. */
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      <DialogContent className={className}>
        <DialogTitle className='sr-only'>{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
