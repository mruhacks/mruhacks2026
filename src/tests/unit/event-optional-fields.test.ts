import { describe, expect, test, vi } from 'vitest';
import { createFormControl } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createEventSchema,
  eventSettingsFormSchema,
  type UpdateEventSettingsInput,
} from '@/app/dashboard/admin/events/schemas';
import { parseOptionalNumber } from '@/lib/form-values';

const optionalFields = [
  'capacity',
  'latitude',
  'longitude',
  'radiusMeters',
  'maxTeamSize',
] as const;

describe('optional event numbers', () => {
  test('keeps blank values optional when the form applies values again after saving', async () => {
    const form = createFormControl<UpdateEventSettingsInput>({
      resolver: zodResolver(eventSettingsFormSchema),
      defaultValues: { name: 'Optional fields' },
    });
    for (const name of optionalFields) {
      form.register(name, { setValueAs: parseOptionalNumber });
      form.setValue(name, parseOptionalNumber(''));
    }
    const saved = vi.fn();
    const invalid = vi.fn();
    await form.handleSubmit(saved, invalid)();
    expect(invalid).not.toHaveBeenCalled();
    const data = saved.mock.calls[0][0];
    for (const name of optionalFields) expect(data[name]).toBeNull();

    form.reset(data);
    for (const name of optionalFields) form.setValue(name, data[name]);
    await form.handleSubmit(saved, invalid)();
    expect(invalid).not.toHaveBeenCalled();
    expect(saved).toHaveBeenCalledTimes(2);
    for (const name of optionalFields)
      expect(saved.mock.calls[1][0][name]).toBeNull();
  });

  test.each([undefined, null, '', '   '])(
    'accepts empty input %s when creating and editing',
    (empty) => {
      const data = {
        name: 'Optional',
        ...Object.fromEntries(
          optionalFields.map((name) => [name, parseOptionalNumber(empty)]),
        ),
      };
      expect(createEventSchema.safeParse(data).success).toBe(true);
      expect(eventSettingsFormSchema.safeParse(data).success).toBe(true);
    },
  );

  test('allows zero coordinates with a positive radius, and reports an incomplete geofence inline', () => {
    expect(
      eventSettingsFormSchema.safeParse({
        latitude: 0,
        longitude: 0,
        radiusMeters: 150,
      }).success,
    ).toBe(true);
    const partial = eventSettingsFormSchema.safeParse({
      latitude: 0,
      longitude: null,
      radiusMeters: null,
    });
    expect(partial.success).toBe(false);
    if (!partial.success)
      expect(partial.error.issues[0].path).toEqual(['latitude']);
  });

  test.each(['0', '-1', '1.5', 'invalid'])(
    'does not mistake invalid capacity %s for an empty field',
    (value) => {
      expect(
        eventSettingsFormSchema.safeParse({
          capacity: parseOptionalNumber(value),
        }).success,
      ).toBe(false);
    },
  );
});
