import 'server-only';

import nodemailer from 'nodemailer';

export type SendMailOptions = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

/** Reads and validates `EMAIL_FROM` from the env */
function getFromAddress(): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (!from) {
    throw new Error('EMAIL_FROM is not set!');
  }
  return from;
}

/** Builds nodemailer SMTP settings from env vars.  
 *  SMTP username and password are not required for Mailhog on local dev
*/
function getTransportConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT?.trim());
  const user = process.env.SMTP_USER?.trim() ?? '';
  const pass = process.env.SMTP_PASSWORD?.trim() ?? '';
  const hasAuth = user.length > 0 && pass.length > 0;
  if (!host) {
    throw new Error('SMTP_HOST is not set!');
  }
  if (!port) {
    throw new Error('SMTP_PORT is not set!');
  }
  return {
    host,
    port,
    auth: hasAuth ? { user, pass } : undefined,
  };
}

let transporter: nodemailer.Transporter | null = null;

/** Creates a singleton SMTP transporter */
function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const { host, port, auth } = getTransportConfig();
    transporter = nodemailer.createTransport({
      host,
      port,
      // Port 465 means we are using SSL/TLS from the start. Other ports don't do use SSL/TLS from the start like when we use MailHog.
      secure: port === 465, 
      ...(auth && { auth }),
    });
  }
  return transporter;
}

/**
 * Sends an email via SMTP
 *
 * @param options - Recipients, subject, and optional text and/or html body.
 * TODO: determine if we need to add cc or bcc
 * TODO: determine if we need to add attachments
 * TODO: determine if we need to add a custom email template
 * TODO: determine if we should use the SES SDK or the SMTP transport
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
