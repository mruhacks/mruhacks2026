'use client';

import * as React from 'react';
import { Loader2, LogOut, Monitor } from 'lucide-react';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { authClient } from '@/utils/auth-client';

type SessionRow = {
  id: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string | Date;
  expiresAt: string | Date;
};

/** Best-effort human label from a user-agent string. */
function describeAgent(ua?: string | null): string {
  if (!ua) return 'Unknown device';
  const browser =
    /Edg/.test(ua) ? 'Edge'
    : /Chrome/.test(ua) ? 'Chrome'
    : /Firefox/.test(ua) ? 'Firefox'
    : /Safari/.test(ua) ? 'Safari'
    : 'Browser';
  const os =
    /Windows/.test(ua) ? 'Windows'
    : /Mac OS/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /(iPhone|iPad|iOS)/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Unknown OS';
  return `${browser} on ${os}`;
}

export function SessionsCard() {
  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [currentToken, setCurrentToken] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busyToken, setBusyToken] = React.useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [list, current] = await Promise.all([
      authClient.listSessions(),
      authClient.getSession(),
    ]);
    setLoading(false);
    if (list.error) {
      toast.error('Failed to load sessions.');
      return;
    }
    setSessions((list.data ?? []) as SessionRow[]);
    setCurrentToken(current.data?.session.token ?? null);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function revokeOne(token: string) {
    setBusyToken(token);
    const res = await authClient.revokeSession({ token });
    setBusyToken(null);
    if (res.error) {
      toast.error('Failed to sign out that session.');
      return;
    }
    toast.success('Session signed out.');
    setSessions((s) => s.filter((row) => row.token !== token));
  }

  async function revokeOthers() {
    setRevokingOthers(true);
    const res = await authClient.revokeOtherSessions();
    setRevokingOthers(false);
    if (res.error) {
      toast.error('Failed to sign out other sessions.');
      return;
    }
    toast.success('Signed out of all other sessions.');
    setSessions((s) => s.filter((row) => row.token === currentToken));
  }

  const hasOthers = sessions.some((s) => s.token !== currentToken);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>
          Devices currently signed in to your account. Sign out anywhere you
          don&apos;t recognize.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {loading ? (
          <div className='text-muted-foreground flex items-center gap-2 text-sm'>
            <Loader2 className='size-4 animate-spin' />
            Loading sessions…
          </div>
        ) : sessions.length === 0 ? (
          <p className='text-muted-foreground text-sm'>No active sessions.</p>
        ) : (
          <ul className='divide-y rounded-lg border'>
            {sessions.map((s) => {
              const isCurrent = s.token === currentToken;
              return (
                <li
                  key={s.id}
                  className='flex items-center justify-between gap-4 p-3'
                >
                  <div className='flex min-w-0 items-center gap-3'>
                    <Monitor className='text-muted-foreground size-4 shrink-0' />
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-medium'>
                        {describeAgent(s.userAgent)}
                        {isCurrent && (
                          <Badge variant='secondary' className='ml-2'>
                            This device
                          </Badge>
                        )}
                      </p>
                      <p className='text-muted-foreground truncate text-xs'>
                        {s.ipAddress || 'IP hidden'} · signed in{' '}
                        {new Date(s.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {!isCurrent && (
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => revokeOne(s.token)}
                      disabled={busyToken === s.token}
                    >
                      {busyToken === s.token ? (
                        <Loader2 className='size-4 animate-spin' />
                      ) : (
                        <LogOut className='size-4' />
                      )}
                      Sign out
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {hasOthers && (
          <Button
            variant='outline'
            onClick={revokeOthers}
            disabled={revokingOthers}
          >
            {revokingOthers ? 'Signing out…' : 'Sign out of all other sessions'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
