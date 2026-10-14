'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';

import { displaySettings } from '@/db/schema';
import { db } from '@/utils/db';
import { getUser } from '@/utils/auth';
import { requirePermission } from '@/lib/rbac/authorization';
import { fail, ok, type ActionResult } from '@/utils/action-result';
import { serverActionError } from '@/utils/server-action-error';
import { writeAuditLog } from '@/utils/audit-log';
import { DISPLAY_SETTINGS_CACHE_TAG } from '@/lib/display/feed';

const PERMISSION = 'display:manage:all';

async function authorize(): Promise<string> {
  const caller = await getUser();
  if (!caller) throw new Error('Not authenticated');
  await requirePermission(caller.id, PERMISSION);
  return caller.id;
}

const settingsSchema = z.object({
  showClock: z.boolean(),
  theme: z.enum(['light', 'dark']),
});

export async function updateDisplaySettings(
  input: z.infer<typeof settingsSchema>,
): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return fail('Invalid display settings');

  try {
    const callerId = await authorize();
    await db
      .insert(displaySettings)
      .values({ id: 1, ...parsed.data, updatedByUserId: callerId })
      .onConflictDoUpdate({
        target: displaySettings.id,
        set: { ...parsed.data, updatedByUserId: callerId },
      });
    updateTag(DISPLAY_SETTINGS_CACHE_TAG);

    await writeAuditLog({
      actorId: callerId,
      action: 'display.settings_updated',
      targetType: 'display_settings',
      targetId: 1,
      metadata: parsed.data,
    });
    return ok();
  } catch (error) {
    return serverActionError('save display settings', error);
  }
}
