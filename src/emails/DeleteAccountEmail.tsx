import { Heading, Text } from 'react-email';
import React from 'react';
import { CtaButton, EmailLayout, FallbackLink } from './EmailLayout';

type Props = { url: string; baseUrl: string };

export function DeleteAccountEmail({ url, baseUrl }: Props) {
  return (
    <EmailLayout
      preview='Action required: confirm your MRUHacks account deletion.'
      baseUrl={baseUrl}
    >
      <Heading style={h1}>Confirm account deletion</Heading>
      <Text style={body}>
        We received a request to <strong>permanently delete</strong> your
        MRUHacks account. Click the button below to confirm.
      </Text>
      <Text style={warning}>
        <strong>This action is irreversible.</strong> Your account, profile, and
        all associated data will be erased immediately upon confirmation.
      </Text>
      <Text style={muted}>
        This link is valid for 24 hours. If you did not request account
        deletion, you can safely ignore this email — no changes will be made.
      </Text>
      <CtaButton label='Delete My Account' url={url} />
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
const warning = { ...body, color: '#cc2200' };
const muted = { ...body, color: '#888888' };
