/**
 * Integration tests for email sending via MailHog.
 * Requires MailHog to be running: pnpm services:start
 * MailHog SMTP: localhost:1025  Web UI: http://localhost:8025
 *
 * No nodemailer mock — emails go through SMTP to MailHog for real.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { sendMail } from '@/utils/mail';
import {
  searchMessagesByTo,
  searchMessagesByContent,
  waitForEmail,
  decodeMimeWords,
} from '@/utils/mailhog';

// Unique timestamp so each test run targets fresh mailboxes
const ts = Date.now();

beforeAll(() => {
  process.env.EMAIL_FROM = 'MRUHacks <noreply@localhost>';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '1025';
  process.env.SMTP_USER = '';
  process.env.SMTP_PASSWORD = '';
  process.env.MAILHOG_API_URL = 'http://localhost:8025/api';
});

describe('sendMail → MailHog integration', () => {
  it('delivers a plain-text email', async () => {
    const to = `plain-${ts}@example.com`;
    await sendMail({ to, subject: 'Plain text test', text: 'Hello from test' });

    const msg = await waitForEmail((m) => m.To[0]?.Mailbox === `plain-${ts}`);
    expect(msg.To[0].Mailbox).toBe(`plain-${ts}`);
    expect(msg.Content.Headers['Subject'][0]).toBe('Plain text test');
  });

  it('delivers an HTML email', async () => {
    const to = `html-${ts}@example.com`;
    await sendMail({
      to,
      subject: 'HTML email test',
      html: '<p>Hello <strong>world</strong></p>',
    });

    const msg = await waitForEmail((m) => m.To[0]?.Mailbox === `html-${ts}`);
    expect(msg.Content.Headers['Subject'][0]).toBe('HTML email test');
  });

  it('sends a verification email', async () => {
    const to = `verify-${ts}@example.com`;
    await sendMail({
      to,
      subject: 'Verify your email — MRUHacks',
      html: '<p>Click <a href="https://example.com/verify?token=abc">here</a></p>',
    });

    const msg = await waitForEmail((m) => m.To[0]?.Mailbox === `verify-${ts}`);
    expect(decodeMimeWords(msg.Content.Headers['Subject'][0])).toContain('Verify your email');
  });

  it('sends a password reset email', async () => {
    const to = `reset-${ts}@example.com`;
    await sendMail({
      to,
      subject: 'Reset your password — MRUHacks',
      html: '<p>Click <a href="https://example.com/reset?token=xyz">here</a></p>',
    });

    const messages = await searchMessagesByTo(to);
    expect(messages.length).toBeGreaterThan(0);
    expect(decodeMimeWords(messages[0].Content.Headers['Subject'][0])).toContain('Reset your password');
  });

  it('sends a magic link email', async () => {
    const to = `magic-${ts}@example.com`;
    await sendMail({
      to,
      subject: 'Sign in to MRUHacks',
      html: '<p>Sign in <a href="https://example.com/auth?token=magic">here</a></p>',
    });

    const messages = await searchMessagesByContent('Sign in to MRUHacks');
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].To[0].Mailbox).toBe(`magic-${ts}`);
  });

  it('sends emails to multiple recipients independently', async () => {
    const recipients = [`multi1-${ts}@example.com`, `multi2-${ts}@example.com`];
    for (const to of recipients) {
      await sendMail({ to, subject: 'Multi test', text: 'Test' });
    }

    for (const to of recipients) {
      const messages = await searchMessagesByTo(to);
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].To[0].Mailbox).toBe(to.split('@')[0]);
    }
  });

  it('sets the correct sender address', async () => {
    const to = `sender-${ts}@example.com`;
    await sendMail({ to, subject: 'Sender test', text: 'Check from' });

    const msg = await waitForEmail((m) => m.To[0]?.Mailbox === `sender-${ts}`);
    expect(msg.From.Mailbox).toBe('noreply');
    expect(msg.From.Domain).toBe('localhost');
  });
});
