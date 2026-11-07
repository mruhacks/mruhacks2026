import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DISCORD_LINK } from '@/content';

/**
 * The static export's 404 (`pnpm build:static`, docs/STATIC_EXPORT.md). The
 * static host serves it for every path it doesn't have, which includes the
 * whole signed-in app while it's offline, so it says that rather than
 * "doesn't exist".
 */
export default function StaticNotFound() {
  return (
    <div className='bg-muted/40 flex min-h-screen items-center justify-center p-6'>
      <Card className='max-w-md text-center'>
        <CardHeader>
          <CardTitle className='text-3xl font-semibold'>This page is offline</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='text-muted-foreground'>
            Sign-in, registration and the dashboard are temporarily unavailable. Check our Discord for updates.
          </p>
          <div className='flex flex-wrap justify-center gap-3'>
            <Button asChild>
              <Link href='/'>Go home</Link>
            </Button>
            <Button variant='outline' asChild>
              <a href={DISCORD_LINK}>Join our Discord</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
