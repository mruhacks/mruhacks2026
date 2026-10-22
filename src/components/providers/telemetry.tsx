'use client';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

import { scrubTelemetryUrl } from '@/lib/scrub-telemetry-url';

/**
 * Vercel Analytics and Speed Insights, minus credential query params. A
 * client component because `beforeSend` is a function.
 */
export function Telemetry() {
  return (
    <>
      <Analytics
        beforeSend={(event) => ({
          ...event,
          url: scrubTelemetryUrl(event.url),
        })}
      />
      <SpeedInsights
        beforeSend={(event) => ({
          ...event,
          url: scrubTelemetryUrl(event.url),
        })}
      />
    </>
  );
}
