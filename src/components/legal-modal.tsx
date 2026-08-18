'use client';

import { useRouter } from 'next/navigation';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type LegalModalProps = {
  title: string;
  updated: string;
  children: React.ReactNode;
};

/** Renders legal page content (terms, privacy) as a modal via an intercepting route. */
export function LegalModal({ title, updated, children }: LegalModalProps) {
  const router = useRouter();
  const close = () => router.back();

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Last updated: {updated}</DialogDescription>
        </DialogHeader>
        <div className='space-y-6 text-sm/relaxed [&_a]:text-primary [&_a]:underline [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight [&_li]:ml-1 [&_p]:text-foreground/90 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6'>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
