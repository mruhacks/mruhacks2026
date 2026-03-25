import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardProfileLoading() {
  return (
    <Card className='w-full sm:max-w-2xl'>
      <CardHeader>
        <CardTitle>
          <Skeleton className='h-7 w-40' />
        </CardTitle>
        <CardDescription>
          <Skeleton className='mt-2 h-4 w-full max-w-md' />
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className='space-y-2'>
            <Skeleton className='h-4 w-32' />
            <Skeleton className='h-10 w-full rounded-md' />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
