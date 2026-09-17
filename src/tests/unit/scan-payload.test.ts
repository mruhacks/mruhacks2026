import type { IDetectedBarcode } from '@yudiel/react-qr-scanner';
import { describe, expect, it } from 'vitest';

import { payloadFromResult } from '@/app/dashboard/admin/events/[eventId]/@checkin/scan-payload';

describe('payloadFromResult', () => {
  it("returns the barcode's decoded text as-is", () => {
    const result = { rawValue: 'some-decoded-text' } as IDetectedBarcode;
    expect(payloadFromResult(result)).toBe('some-decoded-text');
  });
});
