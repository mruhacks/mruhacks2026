'use client';

import { authClient } from '@/utils/auth-client';
import { toast } from 'sonner';

export function ImpersonationBanner() {
  const { data: session } = authClient.useSession();

  // The admin plugin adds impersonatedBy to the session object
  const impersonatedBy = (
    session?.session as Record<string, unknown> | undefined
  )?.impersonatedBy as string | undefined;

  if (!impersonatedBy) return null;

  const handleStop = async () => {
    const res = await authClient.admin.stopImpersonating();
    if (res.error) {
      toast.error(res.error.message ?? 'Failed to stop impersonation');
      return;
    }
    // Hard reload so the new (admin) session cookie takes effect everywhere.
    window.location.href = '/dashboard/admin/users';
  };

  return (
    <div className='flex items-center justify-between gap-4 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950'>
      <span>
        You are impersonating <strong>{session?.user.email}</strong>
      </span>
      <button
        onClick={handleStop}
        className='rounded bg-amber-950/20 px-3 py-1 text-xs font-semibold transition-colors hover:bg-amber-950/30'
      >
        Stop impersonating
      </button>
    </div>
  );
}
