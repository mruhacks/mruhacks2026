import { Heading, Text } from 'react-email';
import React from 'react';
import { CtaButton, EmailLayout, FallbackLink } from './EmailLayout';

type Props = { url: string; baseUrl: string };

export function VerifyEmailEmail({ url, baseUrl }: Props) {
  return (
    <EmailLayout preview="Confirm your MRUHacks email address to get started." baseUrl={baseUrl}>
      <Heading style={h1}>Verify your email address</Heading>
      <Text style={body}>
        Welcome to MRUHacks! Click the button below to confirm your email address and activate your account. The link expires in 24 hours.
      </Text>
      <CtaButton label="Verify Email" url={url} />
      <FallbackLink url={url} />
    </EmailLayout>
  );
}

const h1 = { margin: '0 0 20px', fontFamily: 'Arial,Helvetica,sans-serif', fontWeight: 600, fontSize: 22, lineHeight: '1.35', color: '#000000' };
const body = { margin: '0 0 14px', fontFamily: 'Arial,Helvetica,sans-serif', fontSize: 15, lineHeight: '1.7', color: '#333333' };
