import { Skeleton } from '@/components/ui/skeleton';

function LoadingRegion({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex flex-col gap-6' aria-busy='true' aria-live='polite'>
      <span className='sr-only'>Loading this onboarding step.</span>
      <div aria-hidden='true'>{children}</div>
    </div>
  );
}

function HeadingSkeleton({ width = 'w-64' }: { width?: string }) {
  return (
    <div className='space-y-2'>
      <Skeleton className={`h-6 ${width}`} />
      <Skeleton className='h-4 w-full max-w-md' />
    </div>
  );
}

function FieldSkeleton({ width = 'w-32' }: { width?: string }) {
  return (
    <div className='space-y-2'>
      <Skeleton className={`h-4 ${width}`} />
      <Skeleton className='h-9 w-full rounded-md' />
    </div>
  );
}

function FooterSkeleton() {
  return (
    <>
      <Skeleton className='h-px w-full rounded-none' />
      <div className='flex items-center justify-between gap-3'>
        <Skeleton className='h-9 w-20 rounded-full' />
        <Skeleton className='h-9 w-24 rounded-full' />
      </div>
    </>
  );
}

export function WelcomeLegalSkeleton() {
  return (
    <LoadingRegion>
      <div className='flex flex-col gap-6'>
        <div className='space-y-5'>
          <Skeleton className='mx-auto h-32 w-40' />
          <HeadingSkeleton width='w-48' />
        </div>
        <div className='space-y-4'>
          <div className='flex items-start gap-3'>
            <Skeleton className='size-4 shrink-0 rounded-sm' />
            <Skeleton className='h-4 w-full max-w-sm' />
          </div>
          <div className='flex items-start gap-3'>
            <Skeleton className='size-4 shrink-0 rounded-sm' />
            <div className='w-full space-y-2'>
              <Skeleton className='h-4 w-full max-w-md' />
              <Skeleton className='h-4 w-3/4 max-w-sm' />
            </div>
          </div>
        </div>
        <Skeleton className='h-px w-full rounded-none' />
        <Skeleton className='h-9 w-full rounded-full' />
      </div>
    </LoadingRegion>
  );
}

export function WelcomePersonalSkeleton() {
  return (
    <LoadingRegion>
      <div className='flex flex-col gap-6'>
        <HeadingSkeleton />
        <div className='space-y-7'>
          <FieldSkeleton width='w-12' />
          <FieldSkeleton width='w-16' />
          <FieldSkeleton width='w-36' />
        </div>
        <FooterSkeleton />
      </div>
    </LoadingRegion>
  );
}

export function WelcomeAboutSkeleton() {
  return (
    <LoadingRegion>
      <div className='flex flex-col gap-6'>
        <HeadingSkeleton width='w-52' />
        <div className='flex items-center justify-between gap-4 rounded-md border p-4'>
          <div className='flex-1 space-y-2'>
            <Skeleton className='h-4 w-24' />
            <Skeleton className='h-4 w-full max-w-xs' />
          </div>
          <Skeleton className='h-9 w-24 rounded-full' />
        </div>
        <div className='space-y-7'>
          {['w-40', 'w-32', 'w-24', 'w-16', 'w-14'].map((width) => (
            <FieldSkeleton key={width} width={width} />
          ))}
          <div className='flex items-center gap-3'>
            <Skeleton className='size-4 rounded-sm' />
            <Skeleton className='h-4 w-64 max-w-[80%]' />
          </div>
        </div>
        <FooterSkeleton />
      </div>
    </LoadingRegion>
  );
}

export function WelcomeEventSkeleton() {
  return (
    <LoadingRegion>
      <div className='flex flex-col gap-6'>
        <div className='space-y-2'>
          <Skeleton className='h-6 w-72 max-w-[85%]' />
          <Skeleton className='h-4 w-40' />
          <Skeleton className='h-4 w-full max-w-md' />
        </div>
        <div className='space-y-7'>
          <FieldSkeleton width='w-28' />
          <FieldSkeleton width='w-48' />
          <div className='space-y-2'>
            <Skeleton className='h-4 w-56 max-w-[75%]' />
            <Skeleton className='h-24 w-full rounded-md' />
          </div>
          <div className='flex items-center gap-3'>
            <Skeleton className='size-4 rounded-sm' />
            <Skeleton className='h-4 w-52 max-w-[75%]' />
          </div>
        </div>
        <FooterSkeleton />
      </div>
    </LoadingRegion>
  );
}
