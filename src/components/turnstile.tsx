'use client';

import * as React from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          action?: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export type TurnstileHandle = {
  /** Tokens are single-use — call after every submit attempt (success or failure). */
  reset: () => void;
};

type TurnstileProps = {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  action?: string;
  className?: string;
};

/** Renders a Cloudflare Turnstile widget. Send the resulting token as the
 *  `x-captcha-response` header on the request it's meant to gate. */
export const Turnstile = React.forwardRef<TurnstileHandle, TurnstileProps>(
  function Turnstile({ siteKey, onVerify, onExpire, action, className }, ref) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const widgetIdRef = React.useRef<string | null>(null);
    const [scriptReady, setScriptReady] = React.useState(false);

    React.useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetIdRef.current) {
          window.turnstile?.reset(widgetIdRef.current);
        }
      },
    }));

    React.useEffect(() => {
      if (!scriptReady || !containerRef.current || !window.turnstile) return;

      const widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        callback: onVerify,
        'expired-callback': onExpire,
      });
      widgetIdRef.current = widgetId;

      return () => {
        window.turnstile?.remove(widgetId);
        widgetIdRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scriptReady, siteKey, action]);

    return (
      <>
        <Script
          src='https://challenges.cloudflare.com/turnstile/v0/api.js'
          strategy='afterInteractive'
          onReady={() => setScriptReady(true)}
        />
        <div ref={containerRef} className={className} />
      </>
    );
  },
);
