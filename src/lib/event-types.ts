import 'server-only';

import { asc, eq } from 'drizzle-orm';
import { cacheLife } from 'next/cache';

import { eventTypes } from '@/db/schema';
import { parseEventType, type EventType } from '@/types/lookups';
import { db } from '@/utils/db';

export type EventTypeOption = { id: number; label: EventType };

export async function listEventTypes(): Promise<EventTypeOption[]> {
  'use cache';
  cacheLife('max');

  const rows = await db
    .select({ id: eventTypes.id, label: eventTypes.label })
    .from(eventTypes)
    .orderBy(asc(eventTypes.id));

  return rows.flatMap((row) => {
    const label = parseEventType(row.label);
    return label ? [{ id: row.id, label }] : [];
  });
}

export async function eventTypeExists(id: number): Promise<boolean> {
  const [row] = await db.select({ id: eventTypes.id }).from(eventTypes).where(eq(eventTypes.id, id)).limit(1);
  return row != null;
}
