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

describe('sendMail', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    sendMailImpl.mockClear();
    process.env.EMAIL_FROM = 'MRUHacks <noreply@localhost>';
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
        from: 'MRUHacks <noreply@localhost>',
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
