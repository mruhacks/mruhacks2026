import * as React from 'react';

import { getUser } from '@/utils/auth';
import { hasPermission } from '@/lib/rbac/authorization';
import { EventTabs } from './event-tabs';

/**
 * Parallel-route layouts are their own instant-navigation segment — they do
 * not inherit `instant = false` from `dashboard/layout.tsx` or the root
 * layout. This layout reads the session and permission rows to decide which
 * tabs exist, so the segment has no useful static shell and must be allowed
 * to block. Same reason as `dashboard/events/[eventId]/layout.tsx`.
 */
export const instant = false;

type EventLayoutProps = {
  children: React.ReactNode;
  overview: React.ReactNode;
  questions: React.ReactNode;
  responses: React.ReactNode;
  rsvp: React.ReactNode;
  checkin: React.ReactNode;
  teams: React.ReactNode;
  wiki: React.ReactNode;
  params: Promise<{ eventId: string }>;
};

export default async function EventLayout({
  overview,
  questions,
  responses,
  rsvp,
  checkin,
  teams,
  wiki,
  params,
}: EventLayoutProps) {
  const { eventId } = await params;

  // The admin section admits several disjoint permission sets, so a
  // user-admin can reach this page without being able to read teams. The
  // Teams tab redirects to /forbidden on entry, which would throw them off
  // the whole event page — so gate each tab on the permission behind it.
  const user = await getUser();
  const [canReadTeams, canReadArticles, canCheckIn] = user
    ? await Promise.all([
        hasPermission(user.id, 'team:read:all'),
        hasPermission(user.id, 'article:read:all'),
        hasPermission(user.id, 'checkin:write:all'),
      ])
    : [false, false, false];

  const tabs = [
    {
      id: 'overview' as const,
      label: 'Overview & Settings',
      content: overview,
    },
    { id: 'questions' as const, label: 'Questions', content: questions },
    { id: 'responses' as const, label: 'Responses', content: responses },
    { id: 'rsvp' as const, label: 'RSVP', content: rsvp },
    ...(canCheckIn
      ? [{ id: 'checkin' as const, label: 'Check-in', content: checkin }]
      : []),
    ...(canReadTeams
      ? [{ id: 'teams' as const, label: 'Teams', content: teams }]
      : []),
    ...(canReadArticles
      ? [{ id: 'wiki' as const, label: 'Wiki', content: wiki }]
      : []),
  ];

  return <EventTabs eventId={eventId} tabs={tabs} />;
}
