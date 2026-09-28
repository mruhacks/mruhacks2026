'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { Camera, CameraOff } from 'lucide-react';
import type { IDetectedBarcode, IScannerError } from '@yudiel/react-qr-scanner';

import { Button } from '@/components/ui/button';
import { primeScanCue } from './scan-cue';
import { payloadFromResult } from './scan-payload';

// The library needs browser-only APIs at import time, so it can't run
// during SSR — see its README's "Next.js / SSR errors at build time".
const Scanner = dynamic(
  () => import('@yudiel/react-qr-scanner').then((mod) => mod.Scanner),
  { ssr: false },
);

/**
 * Without `allowMultiple`, the library suppresses a repeat `onScan` for a
 * code only until a *different* code (or none at all) is seen — so a
 * participant whose scan failed and re-presents the same pass a few seconds
 * later, with nothing else scanned in between, would never trigger `onScan`
 * again. `allowMultiple` + `scanDelay` instead throttles to at most one
 * `onScan` per this many ms regardless of which code it is — global rather
 * than per-code, but with one phone scanning one pass at a time that's the
 * behavior we actually want: it still lets the same pass be retried.
 */
const REPEAT_SCAN_COOLDOWN_MS = 5000;

function describeCameraError(error: IScannerError): string {
  switch (error.kind) {
    case 'permission-denied':
    case 'security':
      return 'Camera access was blocked. Allow it in your browser settings, then start the camera again.';
    case 'no-camera':
    case 'overconstrained':
      return 'No camera was found on this device.';
    case 'in-use':
      return 'The camera is already in use by another app.';
    case 'insecure-context':
      return 'Cameras only work over HTTPS. Open this page over https://, or on the machine itself at localhost.';
    default:
      return 'The camera could not be started on this device.';
  }
}

type CheckInScannerProps = {
  onPayload: (payload: string) => void;
};

export function CheckInScanner({ onPayload }: CheckInScannerProps) {
  const [active, setActive] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const wakeLockRef = React.useRef<WakeLockSentinel | null>(null);

  const onPayloadRef = React.useRef(onPayload);
  React.useEffect(() => {
    onPayloadRef.current = onPayload;
  }, [onPayload]);

  React.useEffect(() => {
    if (!window.isSecureContext) return;
    let cancelled = false;

    navigator.permissions
      ?.query({ name: 'camera' as PermissionName })
      .then((status) => {
        if (!cancelled && status.state === 'granted') setActive(true);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // Not something the scanner itself manages — hold it independently of
  // whether the camera is starting, running, or has errored out.
  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;

    navigator.wakeLock
      ?.request('screen')
      .then((sentinel) => {
        if (cancelled) {
          void sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, [active]);

  const handleScan = React.useCallback((codes: IDetectedBarcode[]) => {
    const [result] = codes;
    if (!result) return;
    onPayloadRef.current(payloadFromResult(result));
  }, []);

  const handleError = React.useCallback((scanError: IScannerError) => {
    setActive(false);
    setError(describeCameraError(scanError));
  }, []);

  return (
    <div className='space-y-3' onPointerDown={primeScanCue}>
      <div className='bg-muted relative h-[42vh] max-h-96 min-h-56 w-full overflow-hidden rounded-xl border sm:aspect-video sm:h-auto sm:max-h-none'>
        {active ? (
          <Scanner
            onScan={handleScan}
            onError={handleError}
            // Google Wallet and the standalone in-app QR use qr_code; the
            // Apple Wallet pass uses aztec (see generate-pass.ts).
            formats={['qr_code', 'aztec']}
            constraints={{ facingMode: 'environment' }}
            sound={false}
            allowMultiple
            scanDelay={REPEAT_SCAN_COOLDOWN_MS}
            components={{
              finder: true,
              onOff: false,
              torch: false,
              zoom: false,
            }}
            styles={{
              container: { width: '100%', height: '100%' },
              video: { objectFit: 'cover' },
            }}
          >
            <p className='absolute inset-x-0 bottom-0 bg-black/55 py-2 text-center text-sm font-medium text-white'>
              Point at a participant&apos;s pass
            </p>
          </Scanner>
        ) : (
          <div className='text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm'>
            <CameraOff className='size-6' />
            <span>Camera is off</span>
          </div>
        )}
      </div>

      <Button
        type='button'
        variant={active ? 'outline' : 'default'}
        className='h-12 w-full text-base sm:h-9 sm:w-auto sm:text-sm'
        onClick={() => {
          primeScanCue();
          if (active) {
            setActive(false);
            return;
          }
          if (!window.isSecureContext) {
            setError(
              'Cameras only work over HTTPS. Open this page over https://, or on the machine itself at localhost.',
            );
            return;
          }
          setError(null);
          setActive(true);
        }}
      >
        {active ? (
          <>
            <CameraOff className='size-5 sm:size-4' />
            Stop camera
          </>
        ) : (
          <>
            <Camera className='size-5 sm:size-4' />
            Start camera
          </>
        )}
      </Button>

      {error && <p className='text-destructive text-sm'>{error}</p>}
    </div>
  );
}
