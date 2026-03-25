import { Suspense } from 'react';

import RegisterEventIdRedirectContent from './register-redirect-content';

type Props = {
  params: Promise<{ eventId: string }>;
};

export default function RegisterEventIdRedirect({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <RegisterEventIdRedirectContent params={params} />
    </Suspense>
  );
}
