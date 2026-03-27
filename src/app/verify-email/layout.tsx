import type { ReactNode } from 'react';

export default function VerifyEmailLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className='flex min-h-screen items-center justify-center px-4'>
      {children}
    </div>
  );
}
