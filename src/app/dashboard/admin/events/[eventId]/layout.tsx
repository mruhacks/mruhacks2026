'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

type EventLayoutProps = {
  children: React.ReactNode;
  overview: React.ReactNode;
  questions: React.ReactNode;
  responses: React.ReactNode;
  params: Promise<{ eventId: string }>;
};

const TABS = [
  { id: 'overview', label: 'Overview & Settings' },
  { id: 'questions', label: 'Questions' },
  { id: 'responses', label: 'Responses' },
] as const;

export default function EventLayout({
  overview,
  questions,
  responses,
  params,
}: EventLayoutProps) {
  const { eventId } = React.use(params);
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get('tab') || 'overview') as typeof TABS[number]['id'];

  return (
    <div className='space-y-6'>
      {/* Tab Navigation */}
      <div className='flex gap-2 border-b'>
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            asChild
            variant={activeTab === tab.id ? 'default' : 'ghost'}
            className='rounded-none border-b-2 border-transparent data-[active=true]:border-primary'
            data-active={activeTab === tab.id}
          >
            <Link href={`/dashboard/admin/events/${eventId}?tab=${tab.id}`}>
              {tab.label}
            </Link>
          </Button>
        ))}
      </div>

      {/* Active Tab Content */}
      <div>
        {activeTab === 'overview' && overview}
        {activeTab === 'questions' && questions}
        {activeTab === 'responses' && responses}
      </div>
    </div>
  );
}
