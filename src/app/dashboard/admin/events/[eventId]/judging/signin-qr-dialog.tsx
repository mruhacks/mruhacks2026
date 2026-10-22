'use client';

import * as React from 'react';

import type { JudgingRosterRow } from '@/app/dashboard/admin/events/judging-actions';
import { LocalDateTime } from '@/components/local-date-time';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type SignInQr = {
  judge: JudgingRosterRow;
  qrCode: string;
  expiresAt: string;
};

/**
 * Shows a judge's sign-in QR code. The code is a live credential, so it's
 * dropped as soon as the dialog closes.
 */
export function SignInQrDialog({
  qr,
  onClose,
}: {
  qr: SignInQr | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={qr !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {qr && (
          <>
            <DialogHeader>
              <DialogTitle>Sign in {qr.judge.label}</DialogTitle>
              <DialogDescription>
                Have the judge scan this with their phone&apos;s camera. It
                signs whoever scans it in as {qr.judge.email}, works once, and
                expires at <LocalDateTime value={qr.expiresAt} timeOnly />.
              </DialogDescription>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element -- generated per request, a live credential; never cached or optimized */}
            <img
              src={qr.qrCode}
              alt={`Sign-in QR code for ${qr.judge.label}`}
              className='mx-auto size-64 rounded-md bg-white p-2'
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
