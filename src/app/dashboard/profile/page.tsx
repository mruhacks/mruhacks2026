import { Suspense } from 'react';

import DashboardProfileLoading from './loading';
import DashboardProfileContent from './profile-content';

type Props = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default function DashboardProfilePage({ searchParams }: Props) {
  return (
    <Suspense fallback={<DashboardProfileLoading />}>
      <DashboardProfileContent searchParams={searchParams} />
    </Suspense>
  );
}
