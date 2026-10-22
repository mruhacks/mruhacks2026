import { Heading, Text } from 'react-email';
import React from 'react';
import { CtaButton, EmailLayout, FallbackLink, bodyStyle, headingStyle, mutedStyle } from '@/emails/EmailLayout';

type Props = { url: string; baseUrl: string; expiresIn: string };

export function MagicLinkEmail({ url, baseUrl, expiresIn }: Props) {
  return (
    <EmailLayout preview='Your MRUHacks sign-in link — click to continue.' baseUrl={baseUrl}>
      <Heading style={headingStyle}>Sign in to MRUHacks</Heading>
      <Text style={bodyStyle}>
        {`Click the button below to sign in. This link expires in ${expiresIn} and can only be used once.`}
      </Text>
      <Text style={mutedStyle}>If you did not request this, you can safely ignore this email.</Text>
      <CtaButton label='Sign In' url={url} />
      <FallbackLink url={url} />
    </EmailLayout>
  );
}
