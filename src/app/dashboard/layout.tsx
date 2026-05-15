import { Suspense } from 'react';

import { AppSidebar } from '@/components/sidebar/index';
import { Separator } from '@/components/ui/separator';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { DashboardBreadcrumb } from '@/components/dashboardBreadcrumb';
import AppSidebarLoading from '@/components/sidebar/loading';
import {
  getOnboardingState,
  redirectToOnboardingStep,
} from '@/utils/auth';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const state = await getOnboardingState();
  if (state.step !== 'complete') redirectToOnboardingStep(state);

  return (
    <SidebarProvider>
      <Suspense fallback={<AppSidebarLoading />}>
        <AppSidebar />
      </Suspense>
      <SidebarInset>
        <header className='flex h-16 shrink-0 items-center gap-2'>
          <div className='flex items-center gap-2 px-4'>
            <SidebarTrigger className='-ml-1' />
            <Separator
              orientation='vertical'
              className='mr-2 data-[orientation=vertical]:h-4'
            />
            <Suspense fallback={null}>
              <DashboardBreadcrumb />
            </Suspense>
          </div>
        </header>
        <div className='flex flex-1 flex-col gap-4 p-4 pt-0'>{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
