import { describe, expect, test } from 'vitest';

import {
  draftContentErrors,
  renderCampaignEmail,
  sendContentErrors,
  type CampaignContent,
} from '@/lib/campaigns/render-campaign-email';
import {
  applyMergeFields,
  findUnknownMergeFields,
  firstNameOf,
} from '@/lib/campaigns/merge-fields';

const BASE = 'https://app.example.com';

function content(overrides: Partial<CampaignContent> = {}): CampaignContent {
  return {
    type: 'marketing',
    subject: 'Hello {{firstName}}',
    previewText: 'News for {{firstName|friend}}',
    bodyMarkdown: '# Hi {{firstName}}\n\nApplications are **open**.',
    eventName: null,
    ...overrides,
  };
}

describe('merge fields', () => {
  test('substitutes firstName with its fallbacks', () => {
    expect(applyMergeFields('Hi {{firstName}}', { firstName: 'Ada' })).toBe(
      'Hi Ada',
    );
    expect(applyMergeFields('Hi {{ firstName }}', { firstName: null })).toBe(
      'Hi there',
    );
    expect(
      applyMergeFields('Hi {{firstName|friend}}', { firstName: null }),
    ).toBe('Hi friend');
  });

  test('escapes markdown in the inserted name when asked', () => {
    expect(
      applyMergeFields(
        '{{firstName}}',
        { firstName: '*Bob*' },
        { escapeMarkdown: true },
      ),
    ).toBe('\\*Bob\\*');
  });

  test('finds unknown and half-typed fields', () => {
    expect(findUnknownMergeFields('Hi {{lastName}} {{firstName}}')).toEqual([
      '{{lastName}}',
    ]);
    expect(findUnknownMergeFields('Hi {{firs')).toEqual(['{{']);
    expect(findUnknownMergeFields('Hi {{firstName|pal}}')).toEqual([]);
  });

  test('firstNameOf takes the first word', () => {
    expect(firstNameOf('  Ada Lovelace ')).toBe('Ada');
    expect(firstNameOf('')).toBeNull();
  });

  test('unknown fields block saving and sending', () => {
    expect(
      draftContentErrors(content({ bodyMarkdown: 'Hi {{email}}' })),
    ).toHaveLength(1);
    expect(sendContentErrors(content({ subject: '' }))).toContain(
      'Add a subject line.',
    );
    expect(sendContentErrors(content())).toEqual([]);
  });
});

describe('renderCampaignEmail', () => {
  test('renders merge fields into subject, body and text', async () => {
    const email = await renderCampaignEmail(
      content(),
      { firstName: 'Ada' },
      { baseUrl: BASE },
    );
    expect(email.subject).toBe('Hello Ada');
    expect(email.html).toContain('Hi Ada');
    expect(email.html).toContain('<strong>open</strong>');
    expect(email.html).toContain('News for Ada');
    expect(email.text).toContain('HI ADA');
    expect(email.text).toContain('Applications are open.');
  });

  test('drops pasted <script>, <iframe> and other raw HTML', async () => {
    const email = await renderCampaignEmail(
      content({
        bodyMarkdown: [
          'Before',
          '<script>alert(1)</script>',
          '<iframe src="https://evil.example"></iframe>',
          'Inline <img src=x onerror=alert(1)> html',
          '[bad](javascript:alert(1))',
          '```js\nconsole.log(1)\n```',
          '| a | b |\n|---|---|\n| 1 | 2 |',
        ].join('\n\n'),
      }),
      { firstName: 'Ada' },
      { baseUrl: BASE },
    );
    expect(email.html).not.toMatch(/<script|<iframe|onerror|javascript:/i);
    expect(email.html).not.toContain('evil.example');
    expect(email.html).not.toContain('<table><thead');
    expect(email.html).toContain('Before');
    expect(email.text).not.toMatch(/<script|javascript:/i);
  });

  test('renders a CTA button block in HTML and text', async () => {
    const email = await renderCampaignEmail(
      content({
        bodyMarkdown:
          'Ready?\n\n::cta{label="Register now" href="https://mruhacks.ca/register"}',
      }),
      { firstName: null },
      { baseUrl: BASE },
    );
    expect(email.html).toContain('href="https://mruhacks.ca/register"');
    expect(email.html).toContain('Register now');
    expect(email.text).toContain('Register now: https://mruhacks.ca/register');
  });

  test('a CTA with an unsafe link is dropped and blocks sending', async () => {
    const body = '::cta{label="Click" href="javascript:alert(1)"}';
    const email = await renderCampaignEmail(
      content({ bodyMarkdown: body }),
      { firstName: null },
      { baseUrl: BASE },
    );
    expect(email.html).not.toContain('javascript:');
    expect(sendContentErrors(content({ bodyMarkdown: body }))).toHaveLength(1);
  });

  test('makes our own asset paths absolute and drops other relative images', async () => {
    const email = await renderCampaignEmail(
      content({
        bodyMarkdown:
          '![logo](/api/assets/campaign-content/abc.jpg)\n\n![x](/etc/passwd)',
      }),
      { firstName: null },
      { baseUrl: BASE },
    );
    expect(email.html).toContain(
      'src="https://app.example.com/api/assets/campaign-content/abc.jpg"',
    );
    expect(email.html).not.toContain('/etc/passwd');
  });

  test('marketing footer links to unsubscribe; operational names the event', async () => {
    const marketing = await renderCampaignEmail(
      content(),
      { firstName: null, unsubscribeUrl: `${BASE}/unsubscribe?t=abc` },
      { baseUrl: BASE },
    );
    expect(marketing.html).toContain(`${BASE}/unsubscribe?t=abc`);
    expect(marketing.text).toContain(`Unsubscribe: ${BASE}/unsubscribe?t=abc`);

    const operational = await renderCampaignEmail(
      content({ type: 'operational', eventName: 'MRUHacks 2026' }),
      { firstName: null },
      { baseUrl: BASE },
    );
    expect(operational.html).toContain(
      'because you registered for MRUHacks 2026',
    );
    expect(operational.html).not.toContain('Unsubscribe');
  });

  test('keeps text like "Note:this" that parses as a directive', async () => {
    const email = await renderCampaignEmail(
      content({ bodyMarkdown: 'Note:this matters' }),
      { firstName: null },
      { baseUrl: BASE },
    );
    expect(email.text).toContain('Note:this matters');
  });
});
