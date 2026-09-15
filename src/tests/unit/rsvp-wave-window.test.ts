import { describe, expect, test } from 'vitest';

import { DEFAULT_RSVP_RESPONSE_WINDOW_HOURS } from '@/lib/rsvp/constants';
import {
  computeRsvpRespondBy,
  isRsvpWaveActive,
} from '@/lib/rsvp/compute-rsvp-respond-by';
import { selectRsvpWaveInvitees } from '@/lib/rsvp/select-rsvp-wave-invitees';

describe('computeRsvpRespondBy', () => {
  test('adds the configured hours to creation time', () => {
    const createdAt = new Date('2026-09-15T18:00:00.000Z');
    expect(computeRsvpRespondBy(createdAt, 48)).toEqual(
      new Date('2026-09-17T18:00:00.000Z'),
    );
  });

  test('uses a custom window', () => {
    const createdAt = new Date('2026-09-15T18:00:00.000Z');
    expect(computeRsvpRespondBy(createdAt, 24)).toEqual(
      new Date('2026-09-16T18:00:00.000Z'),
    );
  });

  test('default window constant is 48 hours', () => {
    expect(DEFAULT_RSVP_RESPONSE_WINDOW_HOURS).toBe(48);
  });
});

describe('isRsvpWaveActive', () => {
  const now = new Date('2026-09-15T18:00:00.000Z');

  test('is active while respond_by is still in the future', () => {
    expect(isRsvpWaveActive(new Date('2026-09-15T18:00:00.001Z'), now)).toBe(
      true,
    );
  });

  test('is not active when respond_by is now or in the past', () => {
    expect(isRsvpWaveActive(now, now)).toBe(false);
    expect(isRsvpWaveActive(new Date('2026-09-15T17:59:59.000Z'), now)).toBe(
      false,
    );
  });
});

describe('selectRsvpWaveInvitees', () => {
  function applicant(
    id: string,
    createdAt: string,
    userId = id,
  ): {
    userId: string;
    email: string;
    applicationId: string;
    applicationCreatedAt: Date;
  } {
    return {
      userId,
      email: `${userId}@example.com`,
      applicationId: id,
      applicationCreatedAt: new Date(createdAt),
    };
  }

  test('invites everyone when capacity is unlimited', () => {
    const applicants = [
      applicant('b', '2026-09-02T00:00:00.000Z'),
      applicant('a', '2026-09-01T00:00:00.000Z'),
    ];
    expect(
      selectRsvpWaveInvitees(applicants, null).map((row) => row.userId),
    ).toEqual(['a', 'b']);
  });

  test('invites all 8 when 20 spots remain', () => {
    const applicants = Array.from({ length: 8 }, (_, i) =>
      applicant(
        `app-${String(i).padStart(2, '0')}`,
        `2026-09-01T00:00:${String(i).padStart(2, '0')}.000Z`,
      ),
    );
    const invitees = selectRsvpWaveInvitees(applicants, 20);
    expect(invitees).toHaveLength(8);
    expect(invitees.map((row) => row.applicationId)).toEqual(
      applicants.map((row) => row.applicationId),
    );
  });

  test('invites all 20 when exactly 20 are eligible', () => {
    const applicants = Array.from({ length: 20 }, (_, i) =>
      applicant(
        `app-${String(i).padStart(2, '0')}`,
        `2026-09-01T00:${String(i).padStart(2, '0')}:00.000Z`,
      ),
    );
    expect(selectRsvpWaveInvitees(applicants, 20)).toHaveLength(20);
  });

  test('invites the earliest 20 of 50 eligible applicants', () => {
    const applicants = Array.from({ length: 50 }, (_, i) =>
      applicant(
        `app-${String(49 - i).padStart(2, '0')}`,
        `2026-09-01T00:${String(49 - i).padStart(2, '0')}:00.000Z`,
      ),
    );
    const invitees = selectRsvpWaveInvitees(applicants, 20);
    expect(invitees).toHaveLength(20);
    expect(invitees.map((row) => row.applicationId)).toEqual(
      Array.from({ length: 20 }, (_, i) => `app-${String(i).padStart(2, '0')}`),
    );
  });

  test('breaks equal application times with application id only', () => {
    const sameInstant = '2026-09-01T12:00:00.000Z';
    const applicants = [
      applicant(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        sameInstant,
        'later-id',
      ),
      applicant(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        sameInstant,
        'earlier-id',
      ),
    ];
    expect(
      selectRsvpWaveInvitees(applicants, 1).map((row) => row.userId),
    ).toEqual(['earlier-id']);
  });
});
