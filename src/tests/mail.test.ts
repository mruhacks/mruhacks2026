import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendMailImpl = vi.fn();

vi.mock('server-only', () => ({}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: sendMailImpl,
    })),
  },
}));

import { sendMail } from '@/utils/mail';
import {
  deleteAllMessages,
  searchMessagesByTo,
  searchMessagesByContent,
  extractLink,
  waitForEmail,
} from '@/utils/mailhog';

describe('sendMail', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    sendMailImpl.mockClear();
    process.env.EMAIL_FROM = 'MRU Hacks <noreply@localhost>';
    process.env.SMTP_HOST = 'localhost';
    process.env.SMTP_PORT = '1025';
    process.env.SMTP_USER = '';
    process.env.SMTP_PASSWORD = '';
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it('sends mail with from, to, subject, and text', async () => {
    await sendMail({
      to: 'user@example.com',
      subject: 'Test subject',
      text: 'Plain body',
    });

    expect(sendMailImpl).toHaveBeenCalledTimes(1);
    expect(sendMailImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'MRU Hacks <noreply@localhost>',
        to: 'user@example.com',
        subject: 'Test subject',
        text: 'Plain body',
      }),
    );
  });

  it('includes html when provided', async () => {
    await sendMail({
      to: 'user@example.com',
      subject: 'HTML',
      html: '<p>Hi</p>',
    });

    expect(sendMailImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        html: '<p>Hi</p>',
      }),
    );
  });

  it('throws when EMAIL_FROM is missing', async () => {
    delete process.env.EMAIL_FROM;

    await expect(
      sendMail({
        to: 'user@example.com',
        subject: 'x',
      }),
    ).rejects.toThrow(/EMAIL_FROM/);

    expect(sendMailImpl).not.toHaveBeenCalled();
  });
});

describe.skipIf(!process.env.MAILHOG_API_URL)('Email Integration Tests (MailHog)', () => {
  const envSnapshot = { ...process.env };
  const testEmail = `test-${Date.now()}@example.com`;

  beforeEach(async () => {
    // Set up environment for integration tests
    process.env.EMAIL_FROM = 'MRU Hacks <noreply@localhost>';
    process.env.SMTP_HOST = 'localhost';
    process.env.SMTP_PORT = '1025';
    process.env.SMTP_USER = '';
    process.env.SMTP_PASSWORD = '';

    try {
      await deleteAllMessages();
    } catch (err) {
      console.warn('Could not clear MailHog messages:', err);
    }
  });

  afterEach(async () => {
    process.env = { ...envSnapshot };
    try {
      await deleteAllMessages();
    } catch (err) {
      console.warn('Could not clean up MailHog messages:', err);
    }
  });

  it('sends verification email with link', async () => {
      const verificationUrl = `https://example.com/verify?token=abc123`;

      await sendMail({
        to: testEmail,
        subject: 'Verify your email — MRU Hacks',
        html: `<p>Verify your email address by clicking <a href="${verificationUrl}">this link</a>.</p>`,
      });

      const messages = await waitForEmail(
        (msg) => msg.to[0]?.mailbox === testEmail.split('@')[0],
      );

      expect(messages.to[0].mailbox).toBe(testEmail.split('@')[0]);
      expect(messages.headers.subject[0]).toContain('Verify your email');
      expect(messages.html).toContain(verificationUrl);
    },
  );

  it(
    'sends password reset email with link',
    async () => {
      const resetUrl = `https://example.com/reset?token=xyz789`;

      await sendMail({
        to: testEmail,
        subject: 'Reset your password — MRU Hacks',
        html: `<p>Reset your password by clicking <a href="${resetUrl}">this link</a>.</p>`,
      });

      const messages = await searchMessagesByTo(testEmail);
      expect(messages.length).toBeGreaterThan(0);

      const message = messages[0];
      expect(message.headers.subject[0]).toContain('Reset your password');
      expect(message.html).toContain(resetUrl);
    },
  );

  it('sends magic link email', async () => {
    const magicLinkUrl = `https://example.com/auth?token=magic123`;

    await sendMail({
      to: testEmail,
      subject: 'Sign in to MRU Hacks',
      html: `<p>Sign in by clicking <a href="${magicLinkUrl}">this link</a>.</p>`,
    });

    const messages = await searchMessagesByContent('Sign in');
    expect(messages.length).toBeGreaterThan(0);

    const link = extractLink(messages[0], /https:\/\/[^\s<]+/);
    expect(link).toBe(magicLinkUrl);
  });

  it(
    'extracts links from email content',
    async () => {
      const inviteUrl = `https://example.com/invite?code=invite456`;

      await sendMail({
        to: testEmail,
        subject: 'Invitation to MRU Hacks',
        text: `You're invited! Join here: ${inviteUrl}`,
      });

      const messages = await searchMessagesByContent('invited');
      expect(messages.length).toBeGreaterThan(0);

      const message = messages[0];
      const link = extractLink(message, /https:\/\/[^\s]+/);
      expect(link).toBe(inviteUrl);
    },
  );

  it('handles multiple recipients', async () => {
    const recipients = [
      `test1-${Date.now()}@example.com`,
      `test2-${Date.now()}@example.com`,
    ];

    for (const email of recipients) {
      await sendMail({
        to: email,
        subject: 'Test subject',
        text: 'Test content',
      });
    }

    for (const email of recipients) {
      const messages = await searchMessagesByTo(email);
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].to[0].mailbox).toBe(email.split('@')[0]);
    }
  });

  it(
    'includes proper sender information',
    async () => {
      await sendMail({
        to: testEmail,
        subject: 'From Test',
        text: 'Testing sender',
      });

      const messages = await searchMessagesByTo(testEmail);
      expect(messages.length).toBeGreaterThan(0);

      const message = messages[0];
      expect(message.from.mailbox).toBe('noreply');
      expect(message.from.domain).toBe('localhost');
    },
  );
});
