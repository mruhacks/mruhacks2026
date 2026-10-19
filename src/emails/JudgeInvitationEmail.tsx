import { Heading, Text } from 'react-email';
import { CtaButton, EmailLayout, FallbackLink } from './EmailLayout';

type Props = {
  eventName: string;
  url: string;
  baseUrl: string;
};

export function JudgeInvitationEmail({ eventName, url, baseUrl }: Props) {
  return (
    <EmailLayout preview={`You're judging ${eventName}`} baseUrl={baseUrl}>
      <Heading style={h1}>You&rsquo;re judging {eventName}</Heading>
      <Text style={body}>
        You&rsquo;ve been added as a judge for <strong>{eventName}</strong>.
        Sign in to set up your account. During the expo, the app will tell you
        which table to visit next.
      </Text>
      <CtaButton label='Set up my account' url={url} />
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
