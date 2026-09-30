'use client';

import { useId } from 'react';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';

export function RsvpTermsConsent({
  markdown,
  accepted,
  onAcceptedChange,
  disabled,
}: {
  markdown: string | null;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  disabled: boolean;
}) {
  const id = useId();
  if (!markdown?.trim()) return null;

  return (
    <FieldGroup className='w-full gap-3 text-left'>
      <section aria-label='Event Terms' className='flex flex-col gap-2'>
        <h3 className='font-semibold'>Event Terms</h3>
        <div
          className='max-h-64 overflow-y-auto rounded-md border p-4'
          tabIndex={0}
        >
          <MarkdownContent markdown={markdown} />
        </div>
      </section>
      <Field orientation='horizontal' data-disabled={disabled}>
        <Checkbox
          id={id}
          checked={accepted}
          onCheckedChange={(checked) => onAcceptedChange(checked === true)}
          disabled={disabled}
          required
        />
        <FieldLabel htmlFor={id}>
          I have read and agree to the Event Terms.
        </FieldLabel>
      </Field>
    </FieldGroup>
  );
}
