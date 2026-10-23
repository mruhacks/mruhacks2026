import { Heading, Text } from 'react-email';
import React from 'react';
import { CtaButton, EmailLayout, FallbackLink, bodyStyle, headingStyle, mutedStyle } from '@/emails/EmailLayout';

type Props = { url: string; baseUrl: string };

export function ResetPasswordEmail({ url, baseUrl }: Props) {
  return (
    <EmailLayout preview='Reset your MRUHacks account password.' baseUrl={baseUrl}>
      <Heading style={headingStyle}>Reset your password</Heading>
      <Text style={bodyStyle}>
        We received a request to reset the password for your MRUHacks account. Click the button below to choose a new
        password. This link expires in 1 hour.
      </Text>
      <Text style={mutedStyle}>
        If you did not request a password reset, you can safely ignore this email — your password will not change.
      </Text>
      <CtaButton label='Reset Password' url={url} />
      <FallbackLink url={url} />
    </EmailLayout>
  );
}
