import { Suspense } from 'react';

import ApplyPageLoading from './loading';
import ApplyEventContent from './apply-content';

type Props = {
  params: Promise<{ eventId: string }>;
};

export default function ApplyEventPage({ params }: Props) {
  return (
    <Suspense fallback={<ApplyPageLoading />}>
      <ApplyEventContent params={params} />
    </Suspense>
  );
}
