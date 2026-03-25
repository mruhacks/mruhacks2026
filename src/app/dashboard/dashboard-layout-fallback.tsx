import AppSidebarLoading from '@/components/sidebar/loading';
import { Separator } from '@/components/ui/separator';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLayoutFallback() {
  return (
    <SidebarProvider>
      <AppSidebarLoading />
      <SidebarInset>
        <header className='flex h-16 shrink-0 items-center gap-2'>
          <div className='flex items-center gap-2 px-4'>
            <SidebarTrigger className='-ml-1' />
            <Separator
              orientation='vertical'
              className='mr-2 data-[orientation=vertical]:h-4'
            />
            <Skeleton className='h-5 w-48' />
          </div>
        </header>

        <div className='flex flex-1 flex-col gap-4 p-4 pt-0'>
          <Skeleton className='min-h-48 w-full rounded-lg' />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
