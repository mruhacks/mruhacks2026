'use server';

import * as Dietary from '@/lib/dietary/server';
import * as Rbac from '@/lib/rbac/server';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { getUser } from '@/utils/auth';
import { isUuid } from '@/lib/uuid';

export async function getDietaryReport(eventId: string): Promise<ActionResult<Dietary.Report>> {
  const actor = await getUser();
  if (!actor) return fail('Not authenticated');
  await Rbac.requirePermission(actor.id, 'dietary:read:all');
  if (!isUuid(eventId)) return fail('Event not found.');

  const report = await Dietary.loadDietaryReport(eventId);
  if (!report) return fail('Event not found.');

  return ok(report);
}
