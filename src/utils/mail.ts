import 'server-only';

import nodemailer from 'nodemailer';

export type SendMailOptions = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

function getFromAddress(): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (!from) {
    throw new Error('EMAIL_FROM is required to send mail');
  }
  return from;
}

function getTransportConfig() {
  const host = process.env.SMTP_HOST?.trim() || 'localhost';
  const port = Number(process.env.SMTP_PORT ?? '1025');
  const user = process.env.SMTP_USER?.trim() ?? '';
  const pass = process.env.SMTP_PASSWORD ?? '';
  const hasAuth = user.length > 0 || pass.length > 0;

  return {
    host,
    port,
    auth: hasAuth ? { user, pass } : undefined,
  };
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const { host, port, auth } = getTransportConfig();
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      ...(auth && { auth }),
    });
  }
  return transporter;
}

/**
 * Sends an email via SMTP (e.g. MailHog locally, real provider in production).
 * Uses EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD from the environment.
 */
export async function sendMail(options: SendMailOptions): Promise<void> {
  const from = getFromAddress();
  await getTransporter().sendMail({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
}
