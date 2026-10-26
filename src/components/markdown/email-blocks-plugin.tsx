'use client';

/**
 * Email-only blocks for the editor's email profile, stored as markdown leaf
 * directives that `@/lib/campaigns/email-markdown` renders:
 *
 *   ::cta{label="…" href="…"}   a call-to-action button
 *   ::wallet                    per-recipient Add to Apple / Google Wallet badges
 */

import * as React from 'react';
import {
  ButtonWithTooltip,
  insertDirective$,
  useLexicalNodeRemove,
  useMdastNodeUpdater,
  type DirectiveDescriptor,
  type DirectiveEditorProps,
} from '@mdxeditor/editor';
import { usePublisher } from '@mdxeditor/gurx';
import type { RootContent } from 'mdast';
import { MousePointerClick, Wallet, X } from 'lucide-react';

import * as Campaigns from '@/lib/campaigns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type LeafDirective = Extract<RootContent, { type: 'leafDirective' }>;

function CtaEditor({ mdastNode }: DirectiveEditorProps<LeafDirective>) {
  const update = useMdastNodeUpdater<LeafDirective>();
  const remove = useLexicalNodeRemove();
  const id = React.useId();
  const attributes = mdastNode.attributes ?? {};
  const set = (name: 'label' | 'href', value: string) => update({ attributes: { ...attributes, [name]: value } });

  return (
    <div
      className='bg-muted/40 my-2 flex flex-col gap-2 rounded-md border p-3'
      // Lexical would otherwise treat clicks in the inputs as selecting the node.
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className='flex items-center justify-between gap-2'>
        <span className='flex items-center gap-1.5 text-xs font-medium'>
          <MousePointerClick className='size-3.5' /> Button
        </span>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-7'
          onClick={remove}
          aria-label='Remove button'
        >
          <X />
        </Button>
      </div>
      <div className='grid gap-2 sm:grid-cols-2'>
        <div className='flex flex-col gap-1'>
          <Label htmlFor={`${id}-label`} className='text-xs'>
            Label
          </Label>
          <Input
            id={`${id}-label`}
            defaultValue={attributes.label ?? ''}
            placeholder='Register now'
            onChange={(event) => set('label', event.target.value)}
          />
        </div>
        <div className='flex flex-col gap-1'>
          <Label htmlFor={`${id}-href`} className='text-xs'>
            Link
          </Label>
          <Input
            id={`${id}-href`}
            type='url'
            defaultValue={attributes.href ?? ''}
            placeholder='https://'
            onChange={(event) => set('href', event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

export const CTA_DIRECTIVE_DESCRIPTOR: DirectiveDescriptor<LeafDirective> = {
  name: Campaigns.CTA_DIRECTIVE,
  type: 'leafDirective',
  testNode: (node) => node.type === 'leafDirective' && node.name === Campaigns.CTA_DIRECTIVE,
  attributes: ['label', 'href'],
  hasChildren: false,
  Editor: CtaEditor,
};

export function InsertCtaButton() {
  const insertDirective = usePublisher(insertDirective$);
  return (
    <ButtonWithTooltip
      title='Insert button'
      onClick={() =>
        insertDirective({
          type: 'leafDirective',
          name: Campaigns.CTA_DIRECTIVE,
          attributes: { label: '', href: '' },
        })
      }
    >
      <MousePointerClick className='size-5' />
    </ButtonWithTooltip>
  );
}

function WalletEditor() {
  const remove = useLexicalNodeRemove();
  return (
    <div className='bg-muted/40 my-2 flex items-start justify-between gap-2 rounded-md border p-3'>
      <div className='space-y-1'>
        <span className='flex items-center gap-1.5 text-xs font-medium'>
          <Wallet className='size-3.5' /> Wallet buttons
        </span>
        <p className='text-muted-foreground text-xs'>
          Add to Apple Wallet / Google Wallet, with links made for each recipient. People without a confirmed spot get
          the email without them.
        </p>
      </div>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='size-7'
        onClick={remove}
        aria-label='Remove wallet buttons'
      >
        <X />
      </Button>
    </div>
  );
}

export const WALLET_DIRECTIVE_DESCRIPTOR: DirectiveDescriptor<LeafDirective> = {
  name: Campaigns.WALLET_DIRECTIVE,
  type: 'leafDirective',
  testNode: (node) => node.type === 'leafDirective' && node.name === Campaigns.WALLET_DIRECTIVE,
  attributes: [],
  hasChildren: false,
  Editor: WalletEditor,
};

export function InsertWalletButton() {
  const insertDirective = usePublisher(insertDirective$);
  return (
    <ButtonWithTooltip
      title='Insert wallet buttons'
      onClick={() => insertDirective({ type: 'leafDirective', name: Campaigns.WALLET_DIRECTIVE })}
    >
      <Wallet className='size-5' />
    </ButtonWithTooltip>
  );
}
