import { Heading, Text } from 'react-email';
import React from 'react';
import { CtaButton, EmailLayout, FallbackLink, bodyStyle, headingStyle, mutedStyle } from '@/emails/EmailLayout';

type Props = { url: string; baseUrl: string };

export function DeleteAccountEmail({ url, baseUrl }: Props) {
  return (
    <EmailLayout preview='Action required: confirm your MRUHacks account deletion.' baseUrl={baseUrl}>
      <Heading style={headingStyle}>Confirm account deletion</Heading>
      <Text style={bodyStyle}>
        We received a request to <strong>permanently delete</strong> your MRUHacks account. Click the button below to
        confirm.
      </Text>
      <Text style={warning}>
        <strong>This action is irreversible.</strong> Your account, profile, and personal data will be erased
        immediately upon confirmation. Projects you worked on with a team stay, without your name.
      </Text>
      <Text style={mutedStyle}>
        This link is valid for 24 hours. If you did not request account deletion, you can safely ignore this email — no
        changes will be made.
      </Text>
      <CtaButton label='Delete My Account' url={url} />
      <FallbackLink url={url} />
    </EmailLayout>
  );
}

const warning = { ...bodyStyle, color: '#cc2200' };
