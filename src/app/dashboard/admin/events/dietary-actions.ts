'use server';

import { loadDietaryReport } from '@/lib/dietary/load';
import type { DietaryReport } from '@/lib/dietary/report';
import { requirePermission } from '@/lib/rbac/authorization';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { getUser } from '@/utils/auth';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getDietaryReport(eventId: string): Promise<ActionResult<DietaryReport>> {
  const actor = await getUser();
  if (!actor) return fail('Not authenticated');
  await requirePermission(actor.id, 'dietary:read:all');
  if (!UUID_PATTERN.test(eventId)) return fail('Event not found.');

  const report = await loadDietaryReport(eventId);
  if (!report) return fail('Event not found.');

  return ok(report);
}
