import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

type LegalPageProps = {
  title: string;
  /** Human-readable last-updated date, e.g. "July 10, 2026". */
  updated: string;
  children: React.ReactNode;
};

/**
 * Shared shell for static legal/policy pages (privacy, terms). Provides a
 * readable, centered container and consistent heading styles.
 */
export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <div className='bg-muted/30 min-h-screen'>
      <div className='mx-auto max-w-3xl px-6 py-12'>
        <Link
          href='/'
          className='text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1 text-sm'
        >
          <ArrowLeft className='size-4' />
          Back to home
        </Link>

        <h1 className='text-3xl font-semibold tracking-tight'>{title}</h1>
        <p className='text-muted-foreground mt-2 text-sm'>
          Last updated: {updated}
        </p>

        <div className='[&_a]:text-primary [&_p]:text-foreground/90 mt-8 space-y-6 text-sm/relaxed [&_a]:underline [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_li]:ml-1 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6'>
          {children}
        </div>
      </div>
    </div>
  );
}
