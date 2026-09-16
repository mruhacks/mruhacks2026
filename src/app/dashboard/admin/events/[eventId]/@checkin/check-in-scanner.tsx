'use client';

import * as React from 'react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { ResultMetadataType, type Result } from '@zxing/library';
import { Camera, CameraOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { primeScanCue } from './scan-cue';

const REPEAT_SCAN_COOLDOWN_MS = 5000;

function toBase64Url(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Byte segments are the only lossless view of a byte-mode QR: `getText()`
 * runs it through a charset guess that mangles the signature. Wallet passes
 * carry plain base64url ASCII and survive either path.
 */
function payloadFromResult(result: Result): string {
  const segments = result
    .getResultMetadata()
    ?.get(ResultMetadataType.BYTE_SEGMENTS) as ArrayLike<number>[] | undefined;

  const bytes = segments?.length
    ? segments.flatMap((segment) => Array.from(segment, (byte) => byte & 0xff))
    : Array.from(result.getText(), (char) => char.charCodeAt(0) & 0xff);

  return toBase64Url(bytes);
}

/**
 * A bare `facingMode: 'environment'` is only advisory, so a phone may still
 * hand back the selfie camera. Demand the rear one, then retry without the
 * constraint for laptops, which have no camera that can satisfy it.
 */
function startCamera(
  video: HTMLVideoElement,
  onResult: (result?: Result) => void,
): Promise<IScannerControls> {
  const reader = new BrowserQRCodeReader();

  return reader
    .decodeFromConstraints(
      { video: { facingMode: { exact: 'environment' } } },
      video,
      onResult,
    )
    .catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'OverconstrainedError') {
        throw error;
      }
      return reader.decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        video,
        onResult,
      );
    });
}

function describeCameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access was blocked. Allow it in your browser settings, then start the camera again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found on this device.';
  }
  if (name === 'NotReadableError') {
    return 'The camera is already in use by another app.';
  }
  return 'The camera could not be started on this device.';
}

type CheckInScannerProps = {
  onPayload: (payload: string) => void;
};

export function CheckInScanner({ onPayload }: CheckInScannerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const lastScanRef = React.useRef<{ payload: string; at: number } | null>(
    null,
  );
  const [active, setActive] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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

  React.useEffect(() => {
    const video = videoRef.current;
    if (!active || !video) return;

    let cancelled = false;
    let controls: IScannerControls | null = null;
    let wakeLock: WakeLockSentinel | null = null;

    navigator.wakeLock
      ?.request('screen')
      .then((sentinel) => {
        if (cancelled) {
          void sentinel.release();
          return;
        }
        wakeLock = sentinel;
      })
      .catch(() => {});

    startCamera(video, (result) => {
      if (!result) return;
      const payload = payloadFromResult(result);
      const last = lastScanRef.current;
      if (
        last &&
        last.payload === payload &&
        Date.now() - last.at < REPEAT_SCAN_COOLDOWN_MS
      ) {
        return;
      }
      lastScanRef.current = { payload, at: Date.now() };
      onPayloadRef.current(payload);
    })
      .then((started) => {
        if (cancelled) {
          started.stop();
          return;
        }
        controls = started;
      })
      .catch((cameraError) => {
        if (cancelled) return;
        setActive(false);
        setError(describeCameraError(cameraError));
      });

    return () => {
      cancelled = true;
      controls?.stop();
      void wakeLock?.release();
    };
  }, [active]);

  return (
    <div className='space-y-3' onPointerDown={primeScanCue}>
      <div className='bg-muted relative h-[42vh] max-h-96 min-h-56 w-full overflow-hidden rounded-xl border sm:aspect-video sm:h-auto sm:max-h-none'>
        <video
          ref={videoRef}
          className='size-full object-cover'
          playsInline
          muted
        />

        {active ? (
          <>
            <div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
              <div className='aspect-square w-48 max-w-[70%] rounded-2xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]' />
            </div>
            <p className='absolute inset-x-0 bottom-0 bg-black/55 py-2 text-center text-sm font-medium text-white'>
              Point at a participant&apos;s pass
            </p>
          </>
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
