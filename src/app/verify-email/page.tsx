import { Suspense } from 'react';

import VerifyEmailLoading from './loading';
import VerifyEmailContent from './verify-email-content';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailLoading />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
