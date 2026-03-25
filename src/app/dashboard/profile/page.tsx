import { Suspense } from 'react';

import DashboardProfileLoading from './loading';
import DashboardProfileContent from './profile-content';

export default function DashboardProfilePage() {
  return (
    <Suspense fallback={<DashboardProfileLoading />}>
      <DashboardProfileContent />
    </Suspense>
  );
}
