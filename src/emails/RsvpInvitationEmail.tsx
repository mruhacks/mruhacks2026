import { Heading, Text } from 'react-email';
import { CtaButton, EmailLayout, FallbackLink } from './EmailLayout';

type Props = {
  eventName: string;
  /** Pre-formatted deadline in event local time, including a zone label. */
  deadline: string;
  url: string;
  baseUrl: string;
};

export function RsvpInvitationEmail({
  eventName,
  deadline,
  url,
  baseUrl,
}: Props) {
  return (
    <EmailLayout
      preview={`[Action Required] You're invited to ${eventName}!`}
      baseUrl={baseUrl}
    >
      <Heading style={h1}>You&rsquo;re invited to {eventName}!</Heading>
      <Text style={body}>
        You&rsquo;ve been invited to <strong>{eventName}</strong>. We&rsquo;d
        love to have you there. Let us know if you can make it so we can hold
        your spot.
      </Text>
      <Text style={body}>
        Please respond by <strong>{deadline}</strong>.
      </Text>
      <CtaButton label='RSVP Now' url={url} />
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
