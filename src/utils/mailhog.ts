/**
 * MailHog API utilities for testing email functionality.
 * Uses the MailHog v2 REST API.
 */

const MAILHOG_API_URL =
  process.env.MAILHOG_API_URL || 'http://localhost:8025/api';

interface MailHogPath {
  Relays: string[] | null;
  Mailbox: string;
  Domain: string;
  Params: string;
}

export interface MailHogMessage {
  ID: string;
  From: MailHogPath;
  To: MailHogPath[];
  Content: {
    Headers: Record<string, string[]>;
    Body: string;
    Size: number;
  };
  Created: string;
  Raw: {
    From: string;
    To: string[];
    Data: string;
  };
}

interface MailHogListResult {
  total: number;
  count: number;
  start: number;
  items: MailHogMessage[];
}

async function getMessages(start = 0, limit = 50): Promise<MailHogMessage[]> {
  const response = await fetch(
    `${MAILHOG_API_URL}/v2/messages?start=${start}&limit=${limit}`,
  );
  if (!response.ok)
    throw new Error(`MailHog API error: ${response.statusText}`);
  const result: MailHogListResult = await response.json();
  return result.items ?? [];
}

export async function searchMessagesByTo(
  email: string,
): Promise<MailHogMessage[]> {
  const response = await fetch(
    `${MAILHOG_API_URL}/v2/search?kind=to&query=${encodeURIComponent(email)}`,
  );
  if (!response.ok)
    throw new Error(`MailHog API error: ${response.statusText}`);
  const result: MailHogListResult = await response.json();
  return result.items ?? [];
}

async function searchMessagesByFrom(email: string): Promise<MailHogMessage[]> {
  const response = await fetch(
    `${MAILHOG_API_URL}/v2/search?kind=from&query=${encodeURIComponent(email)}`,
  );
  if (!response.ok)
    throw new Error(`MailHog API error: ${response.statusText}`);
  const result: MailHogListResult = await response.json();
  return result.items ?? [];
}

export async function searchMessagesByContent(
  text: string,
): Promise<MailHogMessage[]> {
  const response = await fetch(
    `${MAILHOG_API_URL}/v2/search?kind=containing&query=${encodeURIComponent(text)}`,
  );
  if (!response.ok)
    throw new Error(`MailHog API error: ${response.statusText}`);
  const result: MailHogListResult = await response.json();
  return result.items ?? [];
}

/**
 * Decode RFC 2047 MIME encoded-words (e.g. =?UTF-8?Q?Hello?=).
 * Handles both Q (quoted-printable) and B (base64) encodings.
 */
export function decodeMimeWords(str: string): string {
  return str.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_, charset, encoding, text) => {
      if (encoding.toUpperCase() === 'Q') {
        const bytes = text
          .replace(/_/g, ' ')
          .replace(/=([0-9A-Fa-f]{2})/g, (__: string, hex: string) =>
            String.fromCharCode(parseInt(hex, 16)),
          );
        try {
          return decodeURIComponent(escape(bytes));
        } catch {
          return bytes;
        }
      }
      if (encoding.toUpperCase() === 'B') {
        return Buffer.from(text, 'base64').toString('utf-8');
      }
      return text;
    },
  );
}

/** Poll until a matching email arrives or timeout is exceeded. */
export async function waitForEmail(
  predicate: (msg: MailHogMessage) => boolean,
  timeoutMs = 5000,
  pollIntervalMs = 100,
): Promise<MailHogMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = await getMessages(0, 100);
    const match = messages.find(predicate);
    if (match) return match;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(`Email not found within ${timeoutMs}ms`);
}
