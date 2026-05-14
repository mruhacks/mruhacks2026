/**
 * MailHog API utilities for testing email functionality
 * Used to query and verify emails sent during tests
 */

const MAILHOG_API_URL =
  process.env.MAILHOG_API_URL || 'http://localhost:8025/api';

export interface MailHogMessage {
  id: string;
  from: {
    mailbox: string;
    domain: string;
  };
  to: Array<{
    mailbox: string;
    domain: string;
  }>;
  headers: Record<string, string[]>;
  size: number;
  created: string;
  text?: string;
  html?: string;
}

export interface MailHogSearchResult {
  total: number;
  start: number;
  count: number;
  messages: MailHogMessage[];
}

/**
 * Retrieve all messages from MailHog
 */
export async function getMessages(
  start = 0,
  limit = 50,
): Promise<MailHogSearchResult> {
  const response = await fetch(
    `${MAILHOG_API_URL}/v2/messages?start=${start}&limit=${limit}`,
  );
  if (!response.ok) {
    throw new Error(`MailHog API error: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Search messages by recipient email
 */
export async function searchMessagesByTo(
  email: string,
): Promise<MailHogMessage[]> {
  const response = await fetch(
    `${MAILHOG_API_URL}/v2/search?kind=to&query=${encodeURIComponent(email)}`,
  );
  if (!response.ok) {
    throw new Error(`MailHog API error: ${response.statusText}`);
  }
  const result: MailHogSearchResult = await response.json();
  return result.messages;
}

/**
 * Search messages by sender email
 */
export async function searchMessagesByFrom(
  email: string,
): Promise<MailHogMessage[]> {
  const response = await fetch(
    `${MAILHOG_API_URL}/v2/search?kind=from&query=${encodeURIComponent(email)}`,
  );
  if (!response.ok) {
    throw new Error(`MailHog API error: ${response.statusText}`);
  }
  const result: MailHogSearchResult = await response.json();
  return result.messages;
}

/**
 * Search messages containing text
 */
export async function searchMessagesByContent(
  text: string,
): Promise<MailHogMessage[]> {
  const response = await fetch(
    `${MAILHOG_API_URL}/v2/search?kind=containing&query=${encodeURIComponent(text)}`,
  );
  if (!response.ok) {
    throw new Error(`MailHog API error: ${response.statusText}`);
  }
  const result: MailHogSearchResult = await response.json();
  return result.messages;
}

/**
 * Get message by ID with full content
 */
export async function getMessage(id: string): Promise<MailHogMessage> {
  const response = await fetch(`${MAILHOG_API_URL}/v2/messages/${id}`);
  if (!response.ok) {
    throw new Error(`MailHog API error: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Delete all messages (useful for test cleanup)
 */
export async function deleteAllMessages(): Promise<void> {
  const response = await fetch(`${MAILHOG_API_URL}/v2/messages`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`MailHog API error: ${response.statusText}`);
  }
}

/**
 * Delete a specific message by ID
 */
export async function deleteMessage(id: string): Promise<void> {
  const response = await fetch(`${MAILHOG_API_URL}/v2/messages/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`MailHog API error: ${response.statusText}`);
  }
}

/**
 * Extract link from email content
 * Looks for URLs in the email text or HTML
 */
export function extractLink(
  message: MailHogMessage,
  pattern: string | RegExp,
): string | null {
  const content = message.text || message.html || '';
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
  const match = content.match(regex);
  return match ? match[0] : null;
}

/**
 * Wait for an email to arrive (polling)
 */
export async function waitForEmail(
  predicate: (msg: MailHogMessage) => boolean,
  timeoutMs = 5000,
  pollIntervalMs = 100,
): Promise<MailHogMessage> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const { messages } = await getMessages(0, 100);
    const match = messages.find(predicate);
    if (match) {
      // Fetch full message content
      return getMessage(match.id);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Email not found within ${timeoutMs}ms`);
}
