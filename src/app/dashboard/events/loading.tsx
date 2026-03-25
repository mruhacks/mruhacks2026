import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from 'lucide-react';

export default function DashboardEventsLoading() {
  return (
    <div className='space-y-6'>
      <div>
        <h1 className='flex items-center gap-2 text-2xl font-semibold'>
          <Calendar className='size-6' />
          Events
        </h1>
        <Skeleton className='text-muted-foreground mt-1 h-5 w-72' />
      </div>

      <ul className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i}>
            <Card className='flex h-full flex-col'>
              <CardHeader className='pb-2'>
                <CardTitle className='text-lg'>
                  <Skeleton className='h-6 w-40' />
                </CardTitle>
                <CardDescription>
                  <Skeleton className='h-4 w-48' />
                </CardDescription>
              </CardHeader>
              <CardContent className='mt-auto pt-4'>
                <Skeleton className='h-9 w-24' />
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
