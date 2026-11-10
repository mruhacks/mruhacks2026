/** Campaign enums, shared by the schema, the server and the editor UI. */

export const TYPES = ['marketing', 'operational'] as const;
export type Type = (typeof TYPES)[number];

/**
 * `pending_approval` sits between a draft and anything that sends: someone
 * asked for the campaign to go out, and a second person has to approve it
 * first. Like every status after `draft`, it's read-only.
 */
export const STATUSES = ['draft', 'pending_approval', 'scheduled', 'sending', 'sent', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];

/** How a status reads in the UI. */
export const STATUS_LABELS: Record<Status, string> = {
  draft: 'Draft',
  pending_approval: 'Needs approval',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  cancelled: 'Stopped',
};

export const DELIVERY_STATUSES = ['queued', 'sent', 'failed', 'skipped'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
