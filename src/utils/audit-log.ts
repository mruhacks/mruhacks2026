import { auditLog } from '@/db/schema';
import { db } from '@/utils/db';

/** Persist a security-relevant action without blocking the successful mutation. */
export async function writeAuditLog(entry: {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId?: string | number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId == null ? null : String(entry.targetId),
      metadata: entry.metadata,
    });
  } catch (error) {
    // An audit-storage outage must be visible to operations without turning a
    // completed primary DB transaction into a misleading client failure.
    console.error('[audit] failed to persist event', { entry, error });
  }
}
