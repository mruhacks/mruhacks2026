import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import * as Rbac from '@/lib/rbac/server';
import { getWikiSidebarArticles } from '@/lib/event-wiki';
import { resolveEventId } from '@/lib/events';
import { eventPath } from '@/lib/event-slug';
import * as schema from '@/db/schema';

type Props = {
  params: Promise<{ eventId: string }>;
};

/**
 * Bare `/wiki` has nothing of its own to show, so it redirects to whichever
 * article is first in the sidebar (`../layout.tsx`'s ordering, terms
 * included) rather than rendering an empty "pick something" panel. An event
 * with no articles and no terms has nothing to redirect to, so it 404s.
 */
export default async function EventWikiIndexPage({ params }: Props) {
  const { eventId: segment } = await params;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');

  const [event] = await db
    .select({ id: schema.events.id, slug: schema.events.slug, termsId: schema.events.termsId })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  if (!event) notFound();

  const canSeeDrafts = await Rbac.hasPermission(user.id, 'article:read:all');
  const [first] = await getWikiSidebarArticles(eventId, {
    canSeeDrafts,
    hasTerms: event.termsId !== null,
  });
  if (!first) notFound();

  redirect(`${eventPath(event)}/wiki/${first.slug}`);
}
