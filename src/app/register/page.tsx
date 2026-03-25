import { Suspense } from 'react';

import RegisterRedirectContent from './register-content';

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterRedirectContent />
    </Suspense>
  );
}
