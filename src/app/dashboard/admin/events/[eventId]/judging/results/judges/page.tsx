import * as React from 'react';
import { redirect } from 'next/navigation';

import { requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { JudgesTable } from '../_components/judges-table';

/** Judge reliability is part of the rankings, not the award list. */
export default function JudgeResultsPage() {
  return (
    <React.Suspense fallback={null}>
      <JudgeResults />
    </React.Suspense>
  );
}

async function JudgeResults() {
  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'judging:results:all');
  return <JudgesTable />;
}
