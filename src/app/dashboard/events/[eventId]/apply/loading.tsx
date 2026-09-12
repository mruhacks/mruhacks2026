import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export default function ApplyPageLoading() {
  return (
    <Card className='w-full sm:max-w-2xl'>
      <CardHeader>
        <CardTitle>
          <Skeleton className='h-6 w-56' />
        </CardTitle>
        <CardDescription>
          <Skeleton className='mt-2 h-4 w-64' />
        </CardDescription>
      </CardHeader>

      <CardContent className='space-y-8'>
        <section className='space-y-4'>
          <div>
            <Skeleton className='h-5 w-32' />
            <Skeleton className='mt-2 h-4 w-72' />
          </div>
          <div className='space-y-3 rounded-lg border p-4'>
            <div className='mb-4 flex items-center justify-between'>
              <Skeleton className='h-3 w-28' />
              <Skeleton className='h-8 w-16' />
            </div>
            <div className='grid grid-cols-2 gap-4 sm:grid-cols-3'>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className='space-y-1.5'>
                  <Skeleton className='h-3 w-16' />
                  <Skeleton className='h-4 w-20' />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className='space-y-4'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='space-y-2'>
              <Skeleton className='h-4 w-40' />
              <Skeleton className='h-10 w-full rounded-md' />
            </div>
          ))}

          <div className='mt-6 flex justify-end'>
            <Button disabled>
              <Skeleton className='h-4 w-12' />
            </Button>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
