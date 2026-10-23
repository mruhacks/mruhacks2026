import { Heading, Text } from 'react-email';
import { CtaButton, EmailLayout, FallbackLink, bodyStyle, headingStyle } from './EmailLayout';

type Props = {
  eventName: string;
  /** Pre-formatted deadline in event local time, including a zone label. */
  deadline: string;
  url: string;
  baseUrl: string;
};

export function RsvpInvitationEmail({ eventName, deadline, url, baseUrl }: Props) {
  return (
    <EmailLayout preview={`[Action Required] You're invited to ${eventName}!`} baseUrl={baseUrl}>
      <Heading style={headingStyle}>You&rsquo;re invited to {eventName}!</Heading>
      <Text style={bodyStyle}>
        You&rsquo;ve been invited to <strong>{eventName}</strong>. We&rsquo;d love to have you there. Let us know if you
        can make it so we can hold your spot.
      </Text>
      <Text style={bodyStyle}>
        Please respond by <strong>{deadline}</strong>.
      </Text>
      <CtaButton label='RSVP Now' url={url} />
      <FallbackLink url={url} />
    </EmailLayout>
  );
}
