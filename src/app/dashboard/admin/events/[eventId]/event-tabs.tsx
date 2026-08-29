'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export type EventTabId =
  | 'overview'
  | 'questions'
  | 'responses'
  | 'teams'
  | 'wiki';

type Tab = { id: EventTabId; label: string; content: React.ReactNode };

type Props = { eventId: string; tabs: Tab[] };

export function EventTabs({ eventId, tabs }: Props) {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab =
    tabs.find((tab) => tab.id === requestedTab)?.id ?? tabs[0]?.id;

  return (
    <div className='space-y-6'>
      {/* Tab Navigation */}
      <div className='flex gap-2 border-b'>
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            asChild
            variant={activeTab === tab.id ? 'default' : 'ghost'}
            className='data-[active=true]:border-primary rounded-none border-b-2 border-transparent'
            data-active={activeTab === tab.id}
          >
            <Link href={`/dashboard/admin/events/${eventId}?tab=${tab.id}`}>
              {tab.label}
            </Link>
          </Button>
        ))}
      </div>

      {/* Active Tab Content */}
      <div>{tabs.find((tab) => tab.id === activeTab)?.content}</div>
    </div>
  );
}
