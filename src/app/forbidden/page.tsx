import { Suspense } from 'react';

import ForbiddenContent from './forbidden-content';

function ForbiddenFallback() {
  return (
    <div className='bg-muted/40 flex min-h-screen items-center justify-center p-6'>
      <p className='text-muted-foreground text-sm'>Loading…</p>
    </div>
  );
}

export default function ForbiddenPage() {
  return (
    <Suspense fallback={<ForbiddenFallback />}>
      <ForbiddenContent />
    </Suspense>
  );
}
