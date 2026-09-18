import { describe, it, expect } from 'vitest';
import { formatDateRange, setFieldByKey } from '@/lib/wallet/generate-pass';
import { resolveParticipantName } from '@/lib/wallet/participation';

describe('formatDateRange', () => {
  it('returns null when neither date is set', () => {
    expect(formatDateRange(null, null)).toBeNull();
  });

  it('formats a same-year range without repeating the year on the start date', () => {
    const startsAt = new Date('2026-10-23T09:00:00-06:00');
    const endsAt = new Date('2026-10-25T23:59:59-06:00');
    expect(formatDateRange(startsAt, endsAt)).toBe('Oct 23–Oct 25, 2026');
  });

  it('formats a same-day event as a time range rather than a repeated date', () => {
    const startsAt = new Date('2026-09-16T09:00:00-06:00');
    const endsAt = new Date('2026-09-16T17:00:00-06:00');
    expect(formatDateRange(startsAt, endsAt)).toBe('Sep 16, 9:00 AM–5:00 PM');
  });

  it('treats the venue day, not the UTC day, as the same day', () => {
    // 6pm-11pm MDT is already the next day in UTC.
    const startsAt = new Date('2026-09-16T18:00:00-06:00');
    const endsAt = new Date('2026-09-16T23:00:00-06:00');
    expect(formatDateRange(startsAt, endsAt)).toBe('Sep 16, 6:00 PM–11:00 PM');
  });

  it('prints one time when a same-day event starts and ends at the same instant', () => {
    const at = new Date('2026-09-16T09:00:00-06:00');
    expect(formatDateRange(at, at)).toBe('Sep 16, 9:00 AM');
  });

  it('includes the year on both ends of a cross-year range', () => {
    const startsAt = new Date('2026-12-31T09:00:00-07:00');
    const endsAt = new Date('2027-01-02T23:59:59-07:00');
    expect(formatDateRange(startsAt, endsAt)).toBe('Dec 31, 2026–Jan 2, 2027');
  });

  it('formats a single date when only the start is known', () => {
    const startsAt = new Date('2026-10-23T09:00:00-06:00');
    expect(formatDateRange(startsAt, null)).toBe('Oct 23, 2026');
  });

  it('formats a single date when only the end is known', () => {
    const endsAt = new Date('2026-10-25T23:59:59-06:00');
    expect(formatDateRange(null, endsAt)).toBe('Oct 25, 2026');
  });
});

describe('setFieldByKey', () => {
  it('overwrites the value of an existing field', () => {
    const fields = [{ key: 'event', label: 'EVENT', value: 'placeholder' }];
    setFieldByKey(fields, 'event', 'MRUHacks 2026');
    expect(fields).toEqual([
      { key: 'event', label: 'EVENT', value: 'MRUHacks 2026' },
    ]);
  });

  it('removes the field when value is null', () => {
    const fields = [
      { key: 'dates', label: 'DATES', value: 'placeholder' },
      { key: 'venue', label: 'VENUE', value: 'placeholder' },
    ];
    setFieldByKey(fields, 'venue', null);
    expect(fields).toEqual([
      { key: 'dates', label: 'DATES', value: 'placeholder' },
    ]);
  });

  it('is a no-op when the key is not found and value is non-null', () => {
    const fields = [{ key: 'dates', label: 'DATES', value: 'placeholder' }];
    setFieldByKey(fields, 'missing', 'value');
    expect(fields).toEqual([
      { key: 'dates', label: 'DATES', value: 'placeholder' },
    ]);
  });

  it('is a no-op when the key is not found and value is null', () => {
    const fields = [{ key: 'dates', label: 'DATES', value: 'placeholder' }];
    setFieldByKey(fields, 'missing', null);
    expect(fields).toEqual([
      { key: 'dates', label: 'DATES', value: 'placeholder' },
    ]);
  });
});

describe('resolveParticipantName', () => {
  it('prefers the profile full name when set', () => {
    expect(resolveParticipantName('Jane Doe', 'jdoe')).toBe('Jane Doe');
  });

  it('falls back to the account name when there is no profile', () => {
    expect(resolveParticipantName(null, 'jdoe')).toBe('jdoe');
  });

  it('falls back to the account name when the profile name is empty', () => {
    expect(resolveParticipantName('', 'jdoe')).toBe('jdoe');
  });

  it('falls back to a generic label when neither name is set', () => {
    expect(resolveParticipantName(null, '')).toBe('Participant');
  });
});
