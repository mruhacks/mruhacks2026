'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { exportMyData } from './actions';

export function DataExportCard() {
  const [pending, setPending] = React.useState(false);

  async function handleExport() {
    setPending(true);
    const res = await exportMyData();
    setPending(false);

    if (!res.success) {
      toast.error(res.error);
      return;
    }

    const blob = new Blob([JSON.stringify(res.data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mruhacks-data-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    toast.success('Your data has been downloaded.');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export your data</CardTitle>
        <CardDescription>
          Download a copy of all the personal data we hold about you — your
          profile, applications, event history, and preferences — as a
          machine-readable JSON file.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleExport} disabled={pending} variant='outline'>
          <Download className='size-4' />
          {pending ? 'Preparing…' : 'Download my data'}
        </Button>
      </CardContent>
    </Card>
  );
}
