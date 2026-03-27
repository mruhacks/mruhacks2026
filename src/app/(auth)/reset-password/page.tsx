import { Suspense } from 'react';

import { ResetPasswordForm } from './reset-password-form';

function ResetPasswordFallback() {
  return (
    <div className='text-muted-foreground w-full max-w-md text-center text-sm'>
      Loading…
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
