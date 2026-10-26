/** Campaign enums, shared by the schema, the server and the editor UI. */

export const TYPES = ['marketing', 'operational'] as const;
export type Type = (typeof TYPES)[number];

export const STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];

export const DELIVERY_STATUSES = ['queued', 'sent', 'failed', 'skipped'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
