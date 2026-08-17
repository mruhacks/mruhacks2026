import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert } from 'lucide-react';

export default function ForbiddenPageLoading() {
  return (
    <div className='bg-muted/40 flex min-h-screen items-center justify-center p-6'>
      <Card className='w-md text-center shadow-md'>
        <CardHeader className='flex flex-col items-center gap-2'>
          <ShieldAlert className='size-10 text-yellow-500' />
          <CardTitle className='text-3xl font-semibold text-yellow-500'>
            403 – Forbidden
          </CardTitle>
        </CardHeader>

        <CardContent className='space-y-5'>
          <div className='flex flex-col items-center gap-2'>
            <Skeleton className='h-5 w-3/4' />
            <Skeleton className='h-5 w-2/3' />
          </div>

          <div className='flex justify-center gap-2'>
            <Skeleton className='h-10 w-28 rounded-md' />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
