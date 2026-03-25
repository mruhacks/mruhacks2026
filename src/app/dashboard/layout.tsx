import { Suspense } from 'react';

import DashboardAuthShell from './dashboard-auth-shell';
import DashboardLayoutFallback from './dashboard-layout-fallback';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<DashboardLayoutFallback />}>
      <DashboardAuthShell>{children}</DashboardAuthShell>
    </Suspense>
  );
}
