import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Row,
  Column,
  Section,
  Link,
  Text,
} from 'react-email';
import React from 'react';

const GRADIENT =
  'linear-gradient(90deg,#FADF4B,#F07B31,#EC624D,#D841A1,#6943EC,#4D75EE,#93FFFF)';

type Props = {
  preview: string;
  baseUrl: string;
  children: React.ReactNode;
};

export function EmailLayout({ preview, baseUrl, children }: Props) {
  const logoUrl = `${baseUrl}/email-logo.png`;
  return (
    <Html lang="en">
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
          <Section style={{ padding: '28px 24px 16px', textAlign: 'center', backgroundColor: '#ffffff' }}>
            <Link href="https://mruhacks.ca">
              <Img
                src={logoUrl}
                alt="MRUHacks"
                width={200}
                style={{ display: 'block', margin: '0 auto', maxWidth: '80%', height: 'auto' }}
              />
            </Link>
          </Section>

          {/* Rainbow stripe */}
          <Section style={{ height: 4, backgroundImage: GRADIENT, fontSize: 0, lineHeight: 0 }}>
            <Text style={{ display: 'none' }}>&nbsp;</Text>
          </Section>

          {/* Body */}
          <Section style={{ padding: '36px 40px 32px' }}>
            {children}
          </Section>

          {/* Rainbow stripe */}
          <Section style={{ height: 4, backgroundImage: GRADIENT, fontSize: 0, lineHeight: 0 }}>
            <Text style={{ display: 'none' }}>&nbsp;</Text>
          </Section>

          {/* Footer */}
          <Section style={{ backgroundColor: '#0d0d0d', padding: '28px 32px 32px', textAlign: 'center' }}>
            <Text style={{ margin: '0 0 18px', fontFamily: 'Arial,Helvetica,sans-serif', fontWeight: 700, fontSize: 18, color: '#ffffff' }}>
              Find Us Online
            </Text>

            <Row style={{ marginBottom: 20 }}>
              <Column style={{ padding: '0 4px' }}>
                <Link
                  href="https://www.instagram.com/mruhacks/"
                  style={{
                    display: 'inline-block',
                    fontFamily: 'Arial,Helvetica,sans-serif',
                    fontWeight: 700,
                    fontSize: 12,
                    color: '#ffffff',
                    textDecoration: 'none',
                    backgroundImage: 'linear-gradient(135deg,#F07B31,#D841A1)',
                    padding: '10px 18px',
                    borderRadius: 50,
                  }}
                >
                  Instagram
                </Link>
              </Column>
              <Column style={{ padding: '0 4px' }}>
                <Link
                  href="https://ca.linkedin.com/company/mruhacks"
                  style={{
                    display: 'inline-block',
                    fontFamily: 'Arial,Helvetica,sans-serif',
                    fontWeight: 700,
                    fontSize: 12,
                    color: '#ffffff',
                    textDecoration: 'none',
                    backgroundImage: 'linear-gradient(135deg,#4D75EE,#6943EC)',
                    padding: '10px 18px',
                    borderRadius: 50,
                  }}
                >
                  LinkedIn
                </Link>
              </Column>
              <Column style={{ padding: '0 4px' }}>
                <Link
                  href="https://linktr.ee/mruhacks"
                  style={{
                    display: 'inline-block',
                    fontFamily: 'Arial,Helvetica,sans-serif',
                    fontWeight: 700,
                    fontSize: 12,
                    color: '#ffffff',
                    textDecoration: 'none',
                    backgroundImage: 'linear-gradient(135deg,#6943EC,#4D75EE)',
                    padding: '10px 18px',
                    borderRadius: 50,
                  }}
                >
                  Linktree
                </Link>
              </Column>
              <Column style={{ padding: '0 4px' }}>
                <Link
                  href="https://mruhacks.ca/"
                  style={{
                    display: 'inline-block',
                    fontFamily: 'Arial,Helvetica,sans-serif',
                    fontWeight: 700,
                    fontSize: 12,
                    color: '#111111',
                    textDecoration: 'none',
                    backgroundImage: 'linear-gradient(135deg,#FADF4B,#F07B31)',
                    padding: '10px 18px',
                    borderRadius: 50,
                  }}
                >
                  Website
                </Link>
              </Column>
            </Row>

            <Text style={{ margin: 0, fontFamily: 'Arial,Helvetica,sans-serif', fontSize: 12, color: '#bbbbbb' }}>
              Copyright 2026 MRUHacks &bull; Calgary, AB
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function CtaButton({ label, url }: { label: string; url: string }) {
  return (
    <Section style={{ margin: '24px 0 0' }}>
      <Link
        href={url}
        style={{
          display: 'inline-block',
          fontFamily: 'Arial,Helvetica,sans-serif',
          fontWeight: 700,
          fontSize: 15,
          color: '#ffffff',
          textDecoration: 'none',
          backgroundImage: 'linear-gradient(135deg,#6943EC,#4D75EE)',
          padding: '14px 32px',
          borderRadius: 50,
        }}
      >
        {label}
      </Link>
    </Section>
  );
}

export function FallbackLink({ url }: { url: string }) {
  return (
    <Text style={{ margin: '20px 0 0', fontFamily: 'Arial,Helvetica,sans-serif', fontSize: 12, color: '#888888', wordBreak: 'break-all' }}>
      Button not working? Paste this link into your browser:{' '}
      <Link href={url} style={{ color: '#4d75ee', textDecoration: 'underline' }}>
        {url}
      </Link>
    </Text>
  );
}
