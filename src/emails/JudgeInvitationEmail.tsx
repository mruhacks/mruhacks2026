import { Heading, Text } from 'react-email';
import { CtaButton, EmailLayout, FallbackLink, bodyStyle, headingStyle, mutedStyle } from './EmailLayout';

type Props = {
  eventName: string;
  url: string;
  baseUrl: string;
  /** How long the link lasts, e.g. "24 hours". */
  expiresIn: string;
};

export function JudgeInvitationEmail({ eventName, url, baseUrl, expiresIn }: Props) {
  return (
    <EmailLayout preview={`You're judging ${eventName}`} baseUrl={baseUrl}>
      <Heading style={headingStyle}>You&rsquo;re judging {eventName}</Heading>
      <Text style={bodyStyle}>
        You&rsquo;ve been added as a judge for <strong>{eventName}</strong>. Sign in to set up your account. During the
        expo, the app will tell you which table to visit next.
      </Text>
      <Text style={mutedStyle}>{`This link expires in ${expiresIn} and can only be used once.`}</Text>
      <CtaButton label='Set up my account' url={url} />
      <FallbackLink url={url} />
    </EmailLayout>
  );
}
