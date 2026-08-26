import { getUser } from '@/utils/auth';
import QRCode from './qrcode';
import { headers } from 'next/headers';
import { Suspense } from 'react';
import { Skeleton } from '../ui/skeleton';

export default async function UserQrCode() {
  const host = (await headers()).get('host')!;
  const user = await getUser();

  if (!user) throw new Error('No User Logged In');

  const userUrl = new URL(
    `/u/${encodeURIComponent(user.id)}`,
    'https://' + host,
  );

  const loading = <Skeleton className='size-[300px]' />;

  return (
    <Suspense fallback={loading}>
      <QRCode data={userUrl.toString()} />{' '}
    </Suspense>
  );
}
