import { Suspense } from 'react';

import { requireAuthWithPermission } from '@/lib/rbac/guards';
import { hasPermission } from '@/lib/rbac/authorization';
import { listAuditLog, listAuditLogFacets } from '@/app/actions/audit-log';
import { Skeleton } from '@/components/ui/skeleton';
import { AuditLogTable } from './audit-log-table';

export default function AdminAuditLogPage() {
  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-semibold tracking-tight'>Audit log</h1>
        <p className='text-muted-foreground text-sm'>Every privileged action taken across the system, newest first.</p>
      </div>
      <Suspense fallback={<Skeleton className='h-96 w-full rounded-xl' />}>
        <AuditLogContent />
      </Suspense>
    </div>
  );
}

// Permission check + log reads hit the session and DB — kept behind Suspense
// so the heading ships in the shell immediately.
async function AuditLogContent() {
  const caller = await requireAuthWithPermission('audit:read:all');

  const [entriesRes, facetsRes, canReadUsers] = await Promise.all([
    listAuditLog({ page: 1, pageSize: 50 }),
    listAuditLogFacets(),
    // Actor and user-target links lead to the user detail page, which is
    // gated on its own permission; without it they render as plain text.
    hasPermission(caller.id, 'user:read:all'),
  ]);

  if (!entriesRes.success || !entriesRes.data) {
    return (
      <div className='text-destructive text-sm'>
        Failed to load audit log: {!entriesRes.success ? entriesRes.error : 'unknown'}
      </div>
    );
  }

  const facets = facetsRes.success && facetsRes.data ? facetsRes.data : { actions: [], targetTypes: [] };

  return (
    <AuditLogTable
      initialData={entriesRes.data}
      actions={facets.actions}
      targetTypes={facets.targetTypes}
      canReadUsers={canReadUsers}
    />
  );
}
