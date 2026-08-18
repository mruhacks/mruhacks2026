import type { Metadata } from 'next';
import { DM_Sans, DM_Mono, Inter, Geist_Mono } from 'next/font/google';
import { Suspense } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { QueryProvider } from '@/components/providers/query-provider';
import './globals.css';

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

const dmMono = DM_Mono({
  variable: '--font-dm-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'MRUHacks',
};

// This app is an authenticated dashboard where nearly every route needs a
// per-request session check — a poor fit for instant-navigation validation.
// Opt the whole app out at the root rather than chasing this warning route
// by route; individual routes can still re-opt-in with `instant = true`.
export const instant = false;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang='en'
      className={`${dmSans.variable} ${inter.variable} ${dmMono.variable} ${geistMono.variable}`}
    >
      <body className='overflow-x-hidden antialiased'>
        <Suspense fallback={<div className='min-h-screen' />}>
          <QueryProvider>
            {children}
            <Toaster />
          </QueryProvider>
        </Suspense>
      </body>
    </html>
  );
}
