'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const showSignTabs = pathname === '/signin' || pathname === '/signup';
  const activeTab = pathname.includes('signup') ? 'signup' : 'signin';

  return (
    <div className='flex min-h-screen items-center justify-center px-4'>
      <div className='w-full max-w-md space-y-6'>
        {showSignTabs ? (
          <>
            <Tabs value={activeTab} className='w-full'>
              <TabsList className='grid w-full grid-cols-2'>
                <TabsTrigger value='signin' asChild>
                  <Link href='/signin'>Sign In</Link>
                </TabsTrigger>
                <TabsTrigger value='signup' asChild>
                  <Link href='/signup'>Sign Up</Link>
                </TabsTrigger>
              </TabsList>

              {children}
            </Tabs>

            <div className='space-y-3'>
              <div className='relative'>
                <div className='absolute inset-0 flex items-center'>
                  <span className='w-full border-t' />
                </div>
                <div className='relative flex justify-center text-xs uppercase'>
                  <span className='bg-background text-muted-foreground px-2'>
                    Coming soon
                  </span>
                </div>
              </div>
              <div className='grid grid-cols-2 gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  disabled
                  className='w-full'
                >
                  Continue with Google
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  disabled
                  className='w-full'
                >
                  Continue with GitHub
                </Button>
              </div>
            </div>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
