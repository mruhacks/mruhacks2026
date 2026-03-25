import { Suspense } from 'react';

import DashboardEventsLoading from './loading';
import DashboardEventsContent from './events-content';

export default function DashboardEventsPage() {
  return (
    <Suspense fallback={<DashboardEventsLoading />}>
      <DashboardEventsContent />
    </Suspense>
  );
}
