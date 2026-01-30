import UserQrCode from '@/components/QRCode/UserQRCode';
import Link from 'next/link';

export default function Dashboard() {
  return (
    <div>
      <Link href='/register'>Edit Registration</Link>
      <UserQrCode />
    </div>
  );
}
