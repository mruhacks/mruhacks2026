import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function VerifyEmailLoading() {
  return (
    <Card className='w-full sm:max-w-md'>
      <CardHeader>
        <CardTitle>
          <Skeleton className='h-7 w-48' />
        </CardTitle>
        <CardDescription>
          <Skeleton className='mt-2 h-4 w-full' />
          <Skeleton className='mt-2 h-4 max-w-[280px]' />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Skeleton className='h-4 w-full' />
      </CardContent>
    </Card>
  );
}
