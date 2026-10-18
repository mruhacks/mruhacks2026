import type { Metadata } from 'next';

// Account/app pages aren't useful search results; keep them out of the index.
export const metadata: Metadata = { robots: { index: false } };

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className='flex min-h-screen items-center justify-center px-4'>
      <div className='w-full max-w-md'>{children}</div>
    </div>
  );
}
