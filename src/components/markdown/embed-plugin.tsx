'use client';

/**
 * MDXEditor support for `<iframe>` embeds.
 *
 * Without this, MDXEditor turns an `<iframe>` in the markdown into a generic
 * HTML node that recreates the element with *every* attribute from the source
 * — `srcdoc`, `onload`, anything — live inside the editing author's page. This
 * plugin claims iframes first (its import visitor outranks the generic one)
 * and stores only src/title/width/height. The editor preview renders through
 * the same allow-list and fixed sandbox as the read-only renderer, so an
 * author sees exactly what readers will.
 *
 * Registered on every editor so that raw-iframe path is never reachable;
 * `enabled` only controls whether the surface supports embeds at all (the
 * insert button, and whether the preview shows the frame).
 */

import * as React from 'react';
import {
  $getNodeByKey,
  DecoratorNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import {
  ButtonWithTooltip,
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  insertDecoratorNode$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor,
} from '@mdxeditor/editor';
import { Cell, useCellValue, usePublisher } from '@mdxeditor/gurx';
import { SquarePlay } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  EMBED_IFRAME_ALLOW,
  EMBED_IFRAME_REFERRER_POLICY,
  EMBED_IFRAME_SANDBOX,
  EMBED_PROVIDER_NAMES,
  getAllowedEmbedSrc,
  parseEmbedDimension,
  serializeEmbedHtml,
  toEmbedUrl,
  type EmbedAttributes,
} from '@/lib/embeds';

/** Whether this editor's surface renders embeds for readers. */
const embedsEnabled$ = Cell(false);

type SerializedEmbedNode = Spread<EmbedAttributes, SerializedLexicalNode>;

export class EmbedNode extends DecoratorNode<React.ReactNode> {
  __src: string;
  __title?: string;
  __width?: number;
  __height?: number;

  static getType(): string {
    return 'iframe-embed';
  }

  static clone(node: EmbedNode): EmbedNode {
    return new EmbedNode(node.getAttributes(), node.__key);
  }

  static importJSON(serialized: SerializedEmbedNode): EmbedNode {
    return $createEmbedNode(serialized);
  }

  constructor({ src, title, width, height }: EmbedAttributes, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__title = title;
    this.__width = width;
    this.__height = height;
  }

  exportJSON(): SerializedEmbedNode {
    return {
      ...super.exportJSON(),
      ...this.getAttributes(),
      type: EmbedNode.getType(),
      version: 1,
    };
  }

  getAttributes(): EmbedAttributes {
    const self = this.getLatest();
    return {
      src: self.__src,
      title: self.__title,
      width: self.__width,
      height: self.__height,
    };
  }

  createDOM(): HTMLElement {
    return document.createElement('div');
  }

  updateDOM(): false {
    return false;
  }

  isInline(): false {
    return false;
  }

  decorate(editor: LexicalEditor): React.ReactNode {
    return (
      <EmbedPreview
        editor={editor}
        nodeKey={this.getKey()}
        {...this.getAttributes()}
      />
    );
  }
}

export function $createEmbedNode(attributes: EmbedAttributes): EmbedNode {
  return new EmbedNode({
    src: attributes.src,
    title: attributes.title || undefined,
    width: parseEmbedDimension(attributes.width),
    height: parseEmbedDimension(attributes.height),
  });
}

export function $isEmbedNode(
  node: LexicalNode | null | undefined,
): node is EmbedNode {
  return node instanceof EmbedNode;
}

type JsxAttribute = { type: string; name?: string; value?: unknown };

function readAttribute(attributes: JsxAttribute[], name: string) {
  const attribute = attributes.find(
    (a) => a.type === 'mdxJsxAttribute' && a.name === name,
  );
  return typeof attribute?.value === 'string' ? attribute.value : undefined;
}

const EmbedImportVisitor: MdastImportVisitor<never> = {
  testNode: (node) =>
    (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') &&
    node.name === 'iframe',
  visitNode({ mdastNode, lexicalParent }) {
    const { attributes } = mdastNode as unknown as {
      attributes: JsxAttribute[];
    };
    (lexicalParent as unknown as { append(node: LexicalNode): void }).append(
      $createEmbedNode({
        src: readAttribute(attributes, 'src') ?? '',
        title: readAttribute(attributes, 'title'),
        width: parseEmbedDimension(readAttribute(attributes, 'width')),
        height: parseEmbedDimension(readAttribute(attributes, 'height')),
      }),
    );
  },
  // Above MDXEditor's generic HTML visitor (-100), which would otherwise
  // claim the tag.
  priority: 0,
};

const EmbedExportVisitor: LexicalExportVisitor<EmbedNode, never> = {
  testLexicalNode: $isEmbedNode,
  visitLexicalNode({ mdastParent, lexicalNode, actions }) {
    actions.appendToParent(mdastParent, {
      type: 'html',
      value: serializeEmbedHtml(lexicalNode.getAttributes()),
    } as never);
  },
};

export const embedPlugin = realmPlugin<{ enabled: boolean }>({
  init(realm, params) {
    realm.pubIn({
      [embedsEnabled$]: params?.enabled ?? false,
      [addImportVisitor$]: EmbedImportVisitor,
      [addLexicalNode$]: EmbedNode,
      [addExportVisitor$]: EmbedExportVisitor,
    });
  },
  update(realm, params) {
    realm.pub(embedsEnabled$, params?.enabled ?? false);
  },
});

function EmbedPreview({
  editor,
  nodeKey,
  src,
  title,
  width,
  height,
}: EmbedAttributes & { editor: LexicalEditor; nodeKey: NodeKey }) {
  const enabled = useCellValue(embedsEnabled$);
  const embedSrc = enabled ? getAllowedEmbedSrc(src) : null;

  const remove = () =>
    editor.update(() => {
      $getNodeByKey(nodeKey)?.remove();
    });

  return (
    <div className='my-4 rounded-md border p-2' contentEditable={false}>
      {embedSrc ? (
        <iframe
          src={embedSrc}
          title={title || 'Embedded content'}
          width={width}
          height={height}
          sandbox={EMBED_IFRAME_SANDBOX}
          allow={EMBED_IFRAME_ALLOW}
          referrerPolicy={EMBED_IFRAME_REFERRER_POLICY}
          loading='lazy'
          allowFullScreen
          style={{ margin: 0 }}
        />
      ) : (
        <p className='text-destructive m-0 text-sm'>
          {enabled
            ? 'This embed is not from an allowed provider and will not be shown to readers.'
            : 'Embeds are not supported here and will not be shown to readers.'}
        </p>
      )}
      <div className='text-muted-foreground flex items-center justify-between gap-2 pt-2 text-xs'>
        <span className='truncate'>{src || '(no URL)'}</span>
        <Button type='button' size='sm' variant='ghost' onClick={remove}>
          Remove
        </Button>
      </div>
    </div>
  );
}

/** Toolbar button + dialog for inserting an embed by URL. */
export function InsertEmbed() {
  const insertDecoratorNode = usePublisher(insertDecoratorNode$);
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setUrl('');
      setTitle('');
      setError(null);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    // The dialog is portalled out of the DOM, but React still bubbles its
    // submit event to the article form that hosts the editor.
    event.preventDefault();
    event.stopPropagation();

    const src = getAllowedEmbedSrc(toEmbedUrl(url));
    if (!src) {
      setError(
        `Paste a link or embed code from one of: ${EMBED_PROVIDER_NAMES.join(', ')}.`,
      );
      return;
    }
    insertDecoratorNode(() =>
      $createEmbedNode({ src, title: title.trim() || undefined }),
    );
    setOpen(false);
  }

  return (
    <>
      <ButtonWithTooltip
        title='Insert embed'
        onClick={() => handleOpenChange(true)}
      >
        <SquarePlay className='size-5' />
      </ButtonWithTooltip>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <form onSubmit={handleSubmit} className='space-y-4'>
            <DialogHeader>
              <DialogTitle>Insert embed</DialogTitle>
              <DialogDescription>
                Supported: {EMBED_PROVIDER_NAMES.join(', ')}.
              </DialogDescription>
            </DialogHeader>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor='embed-url'>Link or embed code</FieldLabel>
              <Input
                id='embed-url'
                value={url}
                autoFocus
                placeholder='https://www.youtube.com/watch?v=…'
                aria-invalid={error ? true : undefined}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setError(null);
                }}
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor='embed-title'>
                Title (for screen readers)
              </FieldLabel>
              <Input
                id='embed-title'
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button type='submit'>Insert</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
