import { Heading, Text } from 'react-email';
import React from 'react';
import { CtaButton, EmailLayout, FallbackLink } from './EmailLayout';

type Props = { url: string; baseUrl: string };

export function MagicLinkEmail({ url, baseUrl }: Props) {
  return (
    <EmailLayout
      preview='Your MRUHacks sign-in link — click to continue.'
      baseUrl={baseUrl}
    >
      <Heading style={h1}>Sign in to MRUHacks</Heading>
      <Text style={body}>
        Click the button below to sign in. This link expires in 15 minutes and
        can only be used once.
      </Text>
      <Text style={muted}>
        If you did not request this, you can safely ignore this email.
      </Text>
      <CtaButton label='Sign In' url={url} />
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
