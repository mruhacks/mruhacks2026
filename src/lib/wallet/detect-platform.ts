import 'server-only';

import { headers } from 'next/headers';
import { userAgent } from 'next/server';

export type WalletPlatform = 'apple' | 'google' | 'other';

/**
 * Picks which single wallet action to show for the current request: the
 * Apple badge on iOS/macOS, the Google badge on Android, and the QR code
 * fallback everywhere else (desktop, unknown UAs).
 */
export async function detectWalletPlatform(): Promise<WalletPlatform> {
  const headersList = await headers();
  const { os } = userAgent({ headers: headersList });

  if (os.name === 'iOS' || os.name === 'Mac OS') return 'apple';
  if (os.name === 'Android') return 'google';
  return 'other';
}
