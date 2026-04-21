'use client';

import { authClient } from '@/utils/auth-client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export function ImpersonationBanner() {
  const { data: session } = authClient.useSession();
  const router = useRouter();

  // The admin plugin adds impersonatedBy to the session object
  const impersonatedBy = (session?.session as Record<string, unknown> | undefined)
    ?.impersonatedBy as string | undefined;

  if (!impersonatedBy) return null;

  const handleStop = async () => {
    const res = await authClient.admin.stopImpersonating();
    if (res.error) {
      toast.error(res.error.message ?? 'Failed to stop impersonation');
      return;
    }
    router.push('/dashboard/admin/users');
    router.refresh();
  };

  return (
    <div className='bg-amber-500 text-amber-950 flex items-center justify-between gap-4 px-4 py-2 text-sm font-medium'>
      <span>
        You are impersonating <strong>{session?.user.email}</strong>
      </span>
      <button
        onClick={handleStop}
        className='rounded bg-amber-950/20 px-3 py-1 text-xs font-semibold hover:bg-amber-950/30 transition-colors'
      >
        Stop impersonating
      </button>
    </div>
  );
}
