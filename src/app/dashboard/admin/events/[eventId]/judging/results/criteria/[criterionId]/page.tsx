import * as React from 'react';
import { redirect } from 'next/navigation';

import { requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { CriterionTable } from '../../_components/criterion-table';

type Props = { params: Promise<{ eventId: string; criterionId: string }> };

/** One criterion's ranking — rankings only, like the judges table. */
export default function CriterionResultsPage({ params }: Props) {
  return (
    <React.Suspense fallback={null}>
      <CriterionResults paramsPromise={params} />
    </React.Suspense>
  );
}

async function CriterionResults({
  paramsPromise,
}: {
  paramsPromise: Props['params'];
}) {
  const { criterionId } = await paramsPromise;
  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'judging:results:all');
  return <CriterionTable criterionId={criterionId} />;
}
