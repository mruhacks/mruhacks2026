import { describe, expect, test } from 'vitest';

import { EVENT_TIME_ZONE } from '@/lib/datetime';
import { buildRsvpInvitationEmail } from '@/lib/rsvp/rsvp-invitation-email';
import { formatRsvpDeadline } from '@/lib/rsvp/rsvp-datetime';

describe('RSVP deadline formatting', () => {
  const instant = new Date('2026-08-21T05:59:00.000Z');

  test('email deadline matches the intended Calgary local time and includes a zone', () => {
    const formatted = formatRsvpDeadline(instant);
    expect(formatted).toMatch(/August 20, 2026/i);
    expect(formatted).toMatch(/11:59/i);
    expect(formatted).toMatch(/MDT|MST|GMT-6|UTC-6/i);

    const email = buildRsvpInvitationEmail({
      eventName: 'MRUHacks',
      respondBy: instant,
      magicLinkUrl: 'https://example.com/rsvp',
    });
    expect(email.text).toContain(formatted);
    expect(email.html).toContain(formatted);
  });

  test('escapes event names in HTML and leaves plaintext unescaped', () => {
    const email = buildRsvpInvitationEmail({
      eventName: `MRUHacks & Friends <img src=x onerror=alert(1)>`,
      respondBy: instant,
      magicLinkUrl: 'https://example.com/rsvp',
    });

    expect(email.subject).toContain('MRUHacks & Friends');
    expect(email.text).toContain(
      'MRUHacks & Friends <img src=x onerror=alert(1)>',
    );
    expect(email.html).toContain(
      'MRUHacks &amp; Friends &lt;img src=x onerror=alert(1)&gt;',
    );
    expect(email.html).not.toContain('<img');
  });

  test('formatting does not depend on the server process timezone', () => {
    const calgary = formatRsvpDeadline(instant, EVENT_TIME_ZONE);
    const tokyo = formatRsvpDeadline(instant, 'Asia/Tokyo');
    expect(calgary).toBe(formatRsvpDeadline(instant));
    expect(calgary).not.toBe(tokyo);
    expect(calgary).toMatch(/MDT|MST|GMT-6|UTC-6/i);
    expect(tokyo).toMatch(/JST|GMT\+9|UTC\+9/i);
  });
});
