import { describe, expect, test } from 'vitest';

import { getEventDisplayStatus } from '@/app/dashboard/events/event-display-status';
import * as Participation from '@/lib/participation';
import { participationStatusesList, type ParticipationStatus } from '@/types/lookups';

describe('getEventDisplayStatus', () => {
  test('shows the status title and variant for an application event', () => {
    for (const status of participationStatusesList) {
      expect(getEventDisplayStatus({ hasApplication: true, status })).toEqual({
        label: Participation.STATIC_STATUS_DISPLAY[status].title,
        pill: status,
        badgeVariant: Participation.STATIC_STATUS_DISPLAY[status].variant,
      });
    }
  });

  test('prefers the DB display config when given', () => {
    expect(
      getEventDisplayStatus({
        hasApplication: true,
        status: 'waitlisted',
        statusDisplay: { title: 'Custom', variant: 'outline' },
      }),
    ).toEqual({ label: 'Custom', pill: 'waitlisted', badgeVariant: 'outline' });
  });

  test('a signup for an event without an application reads as Registered', () => {
    expect(getEventDisplayStatus({ hasApplication: false, status: 'accepted' })).toEqual({
      label: 'Registered',
      pill: 'registered',
      badgeVariant: 'success',
    });
  });

  test('a waitlisted application is not presented as confirmed', () => {
    const display = getEventDisplayStatus({
      hasApplication: true,
      status: 'waitlisted',
    });
    expect(display.label).not.toBe(Participation.STATIC_STATUS_DISPLAY.accepted.title);
    expect(display.label).not.toMatch(/invited/i);
  });

  test('open states when the user is not involved', () => {
    expect(getEventDisplayStatus({ hasApplication: true, status: null }).pill).toBe('open_to_apply');
    expect(getEventDisplayStatus({ hasApplication: false, status: null }).pill).toBe('registration_open');
  });

  test('a past event reads as ended unless the user took part', () => {
    expect(
      getEventDisplayStatus({
        hasApplication: true,
        status: null,
        hasEnded: true,
      }).pill,
    ).toBe('ended');
    expect(
      getEventDisplayStatus({
        hasApplication: false,
        status: null,
        hasEnded: true,
      }).pill,
    ).toBe('ended');
    expect(
      getEventDisplayStatus({
        hasApplication: true,
        status: 'accepted',
        hasEnded: true,
      }).pill,
    ).toBe('accepted');
  });

  test('a judge sees judging, whatever else is on record', () => {
    expect(
      getEventDisplayStatus({
        hasApplication: true,
        status: 'pending_review',
        isJudge: true,
      }),
    ).toEqual({ label: 'Judging', pill: 'judging', badgeVariant: 'default' });
  });
});

describe('participation status rules', () => {
  const past = new Date('2020-01-01T00:00:00.000Z');
  const future = new Date('2099-01-01T00:00:00.000Z');

  test('an open invitation past its deadline reads as timed_out', () => {
    expect(Participation.resolveEffectiveStatus('invited', past)).toBe('timed_out');
    expect(Participation.resolveEffectiveStatus('invited', future)).toBe('invited');
    expect(Participation.resolveEffectiveStatus('accepted', past)).toBe('accepted');
    expect(Participation.resolveEffectiveStatus('declined', past)).toBe('declined');
    expect(Participation.resolveEffectiveStatus(null, null)).toBe('pending_review');
    expect(Participation.resolveEffectiveStatus('bogus', null)).toBe('pending_review');
  });

  test('only accepted holds a spot', () => {
    expect(participationStatusesList.filter(Participation.isAttending)).toEqual(['accepted']);
  });

  test('anyone still in the running may form a team', () => {
    expect(participationStatusesList.filter((s) => !Participation.canFormTeam(s))).toEqual([
      'denied',
      'declined',
      'timed_out',
    ]);
  });

  test('only a pending review can be edited', () => {
    expect(participationStatusesList.filter(Participation.canEditApplication)).toEqual(['pending_review']);
  });

  test('checked in and no-show are derived from accepted only', () => {
    const ended = past;
    expect(
      Participation.deriveAttendance({
        status: 'accepted',
        checkedIn: true,
        eventEndsAt: null,
      }),
    ).toBe('checked_in');
    expect(
      Participation.deriveAttendance({
        status: 'accepted',
        checkedIn: false,
        eventEndsAt: ended,
      }),
    ).toBe('no_show');
    expect(
      Participation.deriveAttendance({
        status: 'accepted',
        checkedIn: false,
        eventEndsAt: future,
      }),
    ).toBeNull();
    expect(
      Participation.deriveAttendance({
        status: 'declined',
        checkedIn: false,
        eventEndsAt: ended,
      }),
    ).toBeNull();
  });
});

describe('participation transitions', () => {
  const review: ParticipationStatus[] = ['pending_review', 'waitlisted', 'denied'];
  const invitation: ParticipationStatus[] = ['invited', 'accepted', 'declined', 'timed_out'];

  test('review decisions need application:review:all', () => {
    for (const from of review) {
      for (const to of review) {
        expect(Participation.adminTransitionPermissions(from, to)).toEqual(
          from === to ? null : ['application:review:all'],
        );
      }
    }
  });

  test('RSVP outcomes need rsvp:write:all', () => {
    for (const from of invitation) {
      for (const to of invitation) {
        expect(Participation.adminTransitionPermissions(from, to)).toEqual(from === to ? null : ['rsvp:write:all']);
      }
    }
  });

  test('any status can reach any other; crossing between the two needs both', () => {
    for (const from of review) {
      for (const to of invitation) {
        for (const [a, b] of [
          [from, to],
          [to, from],
        ]) {
          expect(new Set(Participation.adminTransitionPermissions(a, b))).toEqual(
            new Set(['application:review:all', 'rsvp:write:all']),
          );
        }
      }
    }
  });

  test('admin options are filtered by the permissions held', () => {
    const reviewOnly = new Set(['application:review:all'] as const);
    expect(Participation.adminStatusOptions('pending_review', reviewOnly, participationStatusesList)).toEqual([
      'waitlisted',
      'denied',
    ]);
    expect(Participation.adminStatusOptions('invited', reviewOnly, participationStatusesList)).toEqual([]);

    const both = new Set(['application:review:all', 'rsvp:write:all'] as const);
    expect(Participation.adminStatusOptions('accepted', both, participationStatusesList)).toEqual(
      participationStatusesList.filter((s) => s !== 'accepted'),
    );
  });

  test('participants may answer, give up a spot, or leave the waitlist — nothing else', () => {
    const allowed = participationStatusesList.flatMap((from) =>
      participationStatusesList
        .filter((to) => Participation.canParticipantTransition(from, to))
        .map((to) => `${from}->${to}`),
    );
    expect(allowed.sort()).toEqual(
      ['accepted->declined', 'invited->accepted', 'invited->declined', 'waitlisted->declined'].sort(),
    );
  });
});
