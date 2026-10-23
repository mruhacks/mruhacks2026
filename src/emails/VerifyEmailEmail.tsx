import { Heading, Text } from 'react-email';
import { CtaButton, EmailLayout, FallbackLink, bodyStyle, headingStyle } from '@/emails/EmailLayout';

type Props = { url: string; baseUrl: string };

export function VerifyEmailEmail({ url, baseUrl }: Props) {
  return (
    <EmailLayout preview='Confirm your MRUHacks email address to get started.' baseUrl={baseUrl}>
      <Heading style={headingStyle}>Verify your email address</Heading>
      <Text style={bodyStyle}>
        Welcome to MRUHacks! Click the button below to confirm your email address and activate your account. The link
        expires in 24 hours.
      </Text>
      <CtaButton label='Verify Email' url={url} />
      <FallbackLink url={url} />
    </EmailLayout>
  );
}
