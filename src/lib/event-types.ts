import 'server-only';

import { asc } from 'drizzle-orm';
import { cacheLife } from 'next/cache';

import { eventTypes } from '@/db/schema';
import { db } from '@/utils/db';

export type EventTypeOption = { id: number; label: string };

export async function listEventTypes(): Promise<EventTypeOption[]> {
  'use cache';
  cacheLife('max');

  return db
    .select({ id: eventTypes.id, label: eventTypes.label })
    .from(eventTypes)
    .orderBy(asc(eventTypes.id));
}
