'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { updateDisplaySettings } from './actions';
import type { DisplaySettings } from '@/lib/display/feed';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export function DisplaySettingsCard({ initial }: { initial: DisplaySettings }) {
  const [saved, setSaved] = React.useState(initial);
  const [settings, setSettings] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const dirty =
    settings.showClock !== saved.showClock || settings.theme !== saved.theme;

  const update = (patch: Partial<DisplaySettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const result = await updateDisplaySettings(settings);
    setSaving(false);
    if (!result.success) return setError(result.error);
    setSaved(settings);
    toast.success('Display settings saved');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>
          Every display follows these. Screens pick up changes within 15
          seconds.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className='flex flex-col gap-4'>
          <Field orientation='horizontal'>
            <FieldContent>
              <FieldLabel htmlFor='display-show-clock'>
                Clock and schedule
              </FieldLabel>
              <FieldDescription>
                Show the time and the schedule down the left side.
              </FieldDescription>
            </FieldContent>
            <Switch
              id='display-show-clock'
              checked={settings.showClock}
              onCheckedChange={(showClock) => update({ showClock })}
            />
          </Field>
          <Field orientation='horizontal'>
            <FieldContent>
              <FieldLabel htmlFor='display-theme'>Theme</FieldLabel>
            </FieldContent>
            <Select
              value={settings.theme}
              onValueChange={(theme) =>
                update({ theme: theme as DisplaySettings['theme'] })
              }
            >
              <SelectTrigger id='display-theme' className='w-32'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='light'>Light</SelectItem>
                <SelectItem value='dark'>Dark</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {error && <FieldError errors={[{ message: error }]} />}
          <div className='flex justify-end'>
            <Button type='submit' disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
