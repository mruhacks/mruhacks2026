import * as React from 'react';

import { getUser } from '@/utils/auth';
import { hasPermission } from '@/lib/rbac/authorization';
import { EventTabs } from './event-tabs';

type EventLayoutProps = {
  children: React.ReactNode;
  overview: React.ReactNode;
  questions: React.ReactNode;
  responses: React.ReactNode;
  teams: React.ReactNode;
  wiki: React.ReactNode;
  params: Promise<{ eventId: string }>;
};

export default async function EventLayout({
  overview,
  questions,
  responses,
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
  const [canReadTeams, canReadArticles] = user
    ? await Promise.all([
        hasPermission(user.id, 'team:read:all'),
        hasPermission(user.id, 'article:read:all'),
      ])
    : [false, false];

  const tabs = [
    {
      id: 'overview' as const,
      label: 'Overview & Settings',
      content: overview,
    },
    { id: 'questions' as const, label: 'Questions', content: questions },
    { id: 'responses' as const, label: 'Responses', content: responses },
    ...(canReadTeams
      ? [{ id: 'teams' as const, label: 'Teams', content: teams }]
      : []),
    ...(canReadArticles
      ? [{ id: 'wiki' as const, label: 'Wiki', content: wiki }]
      : []),
  ];

  return <EventTabs eventId={eventId} tabs={tabs} />;
}
