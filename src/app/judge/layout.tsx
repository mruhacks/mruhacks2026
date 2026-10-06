import * as React from 'react';
import Link from 'next/link';

/**
 * Phone-first chrome for judges walking the expo floor: one narrow column,
 * big tap targets, nothing else competing for attention.
 */
export default function JudgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className='flex min-h-screen flex-col'
      style={{ background: 'var(--ink-050)', fontFamily: 'var(--font-body)' }}
    >
      <header className='border-b bg-white'>
        <div className='mx-auto flex w-full max-w-md items-center justify-between px-4 py-3'>
          <Link href='/judge' className='font-semibold'>
            MRUHacks Judging
          </Link>
          <Link
            href='/dashboard'
            className='text-muted-foreground text-sm hover:underline'
          >
            Dashboard
          </Link>
        </div>
      </header>
      <main className='mx-auto w-full max-w-md flex-1 px-4 py-6'>
        {children}
      </main>
    </div>
  );
}
