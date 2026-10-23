import { Body, Container, Head, Html, Img, Preview, Row, Column, Section, Link, Text } from 'react-email';
import React from 'react';

/** Shared text styles for the templates' content. */
export const headingStyle: React.CSSProperties = {
  margin: '0 0 20px',
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontWeight: 600,
  fontSize: 22,
  lineHeight: '30px',
  color: '#000000',
};
export const bodyStyle: React.CSSProperties = {
  margin: '0 0 14px',
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontSize: 15,
  lineHeight: '25px',
  color: '#333333',
};
export const mutedStyle: React.CSSProperties = {
  ...bodyStyle,
  color: '#888888',
};

const GRADIENT = 'linear-gradient(90deg,#FADF4B,#F07B31,#EC624D,#D841A1,#6943EC,#4D75EE,#93FFFF)';

type Props = {
  preview: string;
  baseUrl: string;
  children: React.ReactNode;
  /**
   * Optional line(s) above the copyright: a marketing campaign's unsubscribe
   * link, or an operational one's "you're receiving this because…".
   */
  footer?: React.ReactNode;
};

export function EmailLayout({ preview, baseUrl, children, footer }: Props) {
  const logoUrl = `${baseUrl}/email-logo.png`;
  return (
    <Html lang='en'>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: '#e8e8e8' }}>
        <Container
          style={{
            margin: '32px auto',
            maxWidth: 600,
            backgroundColor: '#ffffff',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {/* Logo */}
          <Section
            style={{
              padding: '28px 24px 16px',
              textAlign: 'center',
              backgroundColor: '#ffffff',
            }}
          >
            <Link href='https://mruhacks.ca'>
              <Img
                src={logoUrl}
                alt='MRUHacks'
                width={200}
                style={{
                  display: 'block',
                  margin: '0 auto',
                  maxWidth: '80%',
                  height: 'auto',
                }}
              />
            </Link>
          </Section>

          <RainbowStripe />

          {/* Body */}
          <Section style={{ padding: '36px 40px 32px' }}>{children}</Section>

          <RainbowStripe />

          {/* Footer */}
          <Section
            style={{
              backgroundColor: '#0d0d0d',
              padding: '28px 32px 32px',
              textAlign: 'center',
            }}
          >
            <Text
              style={{
                margin: '0 0 18px',
                fontFamily: 'Arial,Helvetica,sans-serif',
                fontWeight: 700,
                fontSize: 18,
                color: '#ffffff',
              }}
            >
              Find Us Online
            </Text>

            <Row style={{ marginBottom: 20 }}>
              <Column style={{ padding: '0 4px' }}>
                <Pill
                  label='Instagram'
                  url='https://www.instagram.com/mruhacks/'
                  color='#F07B31'
                  gradient='linear-gradient(135deg,#F07B31,#D841A1)'
                  small
                />
              </Column>
              <Column style={{ padding: '0 4px' }}>
                <Pill
                  label='LinkedIn'
                  url='https://ca.linkedin.com/company/mruhacks'
                  color='#4D75EE'
                  gradient='linear-gradient(135deg,#4D75EE,#6943EC)'
                  small
                />
              </Column>
              <Column style={{ padding: '0 4px' }}>
                <Pill
                  label='Linktree'
                  url='https://linktr.ee/mruhacks'
                  color='#6943EC'
                  gradient='linear-gradient(135deg,#6943EC,#4D75EE)'
                  small
                />
              </Column>
              <Column style={{ padding: '0 4px' }}>
                <Pill
                  label='Website'
                  url='https://mruhacks.ca/'
                  color='#F07B31'
                  gradient='linear-gradient(135deg,#FADF4B,#F07B31)'
                  textColor='#111111'
                  small
                />
              </Column>
            </Row>

            {footer && (
              <Section
                style={{
                  margin: '0 0 14px',
                  fontFamily: 'Arial,Helvetica,sans-serif',
                  fontSize: 12,
                  lineHeight: '1.6',
                  color: '#bbbbbb',
                }}
              >
                {footer}
              </Section>
            )}

            <Text
              style={{
                margin: 0,
                fontFamily: 'Arial,Helvetica,sans-serif',
                fontSize: 12,
                color: '#bbbbbb',
              }}
            >
              Copyright 2026 MRUHacks &bull; Calgary, AB
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/** 4px gradient bar, solid purple where gradients aren't supported. */
function RainbowStripe() {
  return (
    <Section
      style={{
        height: 4,
        backgroundColor: '#6943EC',
        backgroundImage: GRADIENT,
        fontSize: 0,
        lineHeight: 0,
      }}
    >
      <Text style={{ display: 'none' }}>&nbsp;</Text>
    </Section>
  );
}

/** A pill-shaped link button; `color` shows where gradients aren't supported. */
function Pill({
  label,
  url,
  color,
  gradient,
  textColor = '#ffffff',
  small = false,
}: {
  label: string;
  url: string;
  color: string;
  gradient: string;
  textColor?: string;
  small?: boolean;
}) {
  return (
    <Link
      href={url}
      style={{
        display: 'inline-block',
        fontFamily: 'Arial,Helvetica,sans-serif',
        fontWeight: 700,
        fontSize: small ? 12 : 15,
        color: textColor,
        textDecoration: 'none',
        backgroundColor: color,
        backgroundImage: gradient,
        padding: small ? '10px 18px' : '14px 32px',
        borderRadius: 50,
      }}
    >
      {label}
    </Link>
  );
}

export function CtaButton({ label, url }: { label: string; url: string }) {
  return (
    <Section style={{ margin: '24px 0 0' }}>
      <Pill label={label} url={url} color='#6943EC' gradient='linear-gradient(135deg,#6943EC,#4D75EE)' />
    </Section>
  );
}

export function FallbackLink({ url }: { url: string }) {
  return (
    <Text
      style={{
        margin: '20px 0 0',
        fontFamily: 'Arial,Helvetica,sans-serif',
        fontSize: 12,
        lineHeight: '18px',
        color: '#888888',
        wordBreak: 'break-all',
      }}
    >
      Button not working? Paste this link into your browser:{' '}
      {/* Plain <a>: react-email's Link adds `text-decoration-line:none`,
          which contradicts the underline. */}
      <a href={url} target='_blank' style={{ color: '#4d75ee', textDecoration: 'underline' }}>
        {url}
      </a>
    </Text>
  );
}
