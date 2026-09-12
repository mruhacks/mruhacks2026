import 'server-only';

import { JWT } from 'google-auth-library';

import { getGoogleWalletConfig } from './config';

const WALLET_API_BASE = 'https://walletobjects.googleapis.com/walletobjects/v1';

let cachedClient: JWT | null = null;

function getAuthClient(): JWT {
  if (cachedClient) return cachedClient;
  const config = getGoogleWalletConfig();
  cachedClient = new JWT({
    email: config.serviceAccountEmail,
    key: config.privateKey,
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
  });
  return cachedClient;
}

/**
 * Calls the Google Wallet Objects REST API. Returns null for a 404 (the
 * caller decides whether that means "create it"); throws for anything else
 * that isn't a 2xx.
 */
export async function walletApiRequest<T>(
  path: string,
  init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown },
): Promise<T | null> {
  const { token } = await getAuthClient().getAccessToken();
  if (!token) {
    throw new Error('Failed to obtain a Google Wallet API access token');
  }

  const res = await fetch(`${WALLET_API_BASE}/${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Google Wallet API ${init.method} ${path} failed: ${res.status} ${text}`,
    );
  }
  return (await res.json()) as T;
}
