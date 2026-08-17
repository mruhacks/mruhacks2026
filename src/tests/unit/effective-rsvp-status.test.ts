import { describe, expect, test } from 'vitest';

import {
  isEffectivePendingRsvp,
  resolveEffectiveRsvpStatus,
} from '@/lib/rsvp/effective-rsvp-status';

const now = new Date('2026-08-16T18:00:00.000Z');
const future = new Date('2026-09-01T23:59:59.000Z');
const past = new Date('2026-08-01T00:00:00.000Z');

describe('resolveEffectiveRsvpStatus', () => {
  test('pending + future respondBy stays pending', () => {
    expect(resolveEffectiveRsvpStatus('pending', future, now)).toBe('pending');
    expect(isEffectivePendingRsvp('pending', future, now)).toBe(true);
  });

  test('pending + expired respondBy is timed_out', () => {
    expect(resolveEffectiveRsvpStatus('pending', past, now)).toBe('timed_out');
    expect(isEffectivePendingRsvp('pending', past, now)).toBe(false);
  });

  test('pending with no deadline stays pending', () => {
    expect(resolveEffectiveRsvpStatus('pending', null, now)).toBe('pending');
  });

  test('accepted + expired respondBy remains accepted', () => {
    expect(resolveEffectiveRsvpStatus('accepted', past, now)).toBe('accepted');
  });

  test('declined + expired respondBy remains declined', () => {
    expect(resolveEffectiveRsvpStatus('declined', past, now)).toBe('declined');
  });

  test('already timed_out stays timed_out', () => {
    expect(resolveEffectiveRsvpStatus('timed_out', past, now)).toBe('timed_out');
  });
});
