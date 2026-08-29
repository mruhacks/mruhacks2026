import { Heading, Text } from 'react-email';
import React from 'react';
import { CtaButton, EmailLayout, FallbackLink } from './EmailLayout';

type Props = { url: string; baseUrl: string };

export function ResetPasswordEmail({ url, baseUrl }: Props) {
  return (
    <EmailLayout
      preview='Reset your MRUHacks account password.'
      baseUrl={baseUrl}
    >
      <Heading style={h1}>Reset your password</Heading>
      <Text style={body}>
        We received a request to reset the password for your MRUHacks account.
        Click the button below to choose a new password. This link expires in 1
        hour.
      </Text>
      <Text style={muted}>
        If you did not request a password reset, you can safely ignore this
        email — your password will not change.
      </Text>
      <CtaButton label='Reset Password' url={url} />
      <FallbackLink url={url} />
    </EmailLayout>
  );
}

const h1 = {
  margin: '0 0 20px',
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontWeight: 600,
  fontSize: 22,
  lineHeight: '1.35',
  color: '#000000',
};
const body = {
  margin: '0 0 14px',
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontSize: 15,
  lineHeight: '1.7',
  color: '#333333',
};
const muted = { ...body, color: '#888888' };
