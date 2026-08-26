import { Sidebar, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';

export default function LoadingSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <div className='flex h-[60px] flex-row items-center space-x-3'>
          <div className='bg-muted size-10 animate-pulse rounded-md' />
          <div>
            <Skeleton className='mb-1 h-4 w-24' />
            <Skeleton className='h-3 w-10' />
          </div>
        </div>
      </SidebarHeader>

      <div className='mx-4 border-t' />

      {/* Navigation skeleton */}
      <div className='flex flex-col space-y-3 p-4'>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className='h-8 w-full' />
        ))}
      </div>

      <SidebarFooter>
        {/* User info skeleton */}
        <div className='flex items-center gap-3 p-4'>
          <div className='bg-muted size-10 animate-pulse rounded-full' />
          <div className='flex flex-col'>
            <Skeleton className='mb-1 h-4 w-24' />
            <Skeleton className='h-3 w-16' />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
