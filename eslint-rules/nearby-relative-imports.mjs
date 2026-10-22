/**
 * ESLint rule: nearby-relative-imports
 *
 * Nearby files are imported relatively and everything else through the `@/`
 * alias, so an import path is never a long `@/app/dashboard/...` restatement
 * of where the file already lives, and never a `../../..` chain either.
 *
 * "Nearby" means inside the importing file's anchor directory: its parent
 * directory, or its own directory when the parent is `src/` or a top-level
 * area like `src/app` or `src/lib`. So a relative path climbs at most one
 * `../`, and top-level areas (and the flat files in them) always use `@/`:
 *
 *   // in src/app/dashboard/events/[eventId]/page.tsx (anchor: src/app/dashboard/events)
 *   import { TeamPanel } from '../team/TeamPanel';     // not '@/app/dashboard/events/team/TeamPanel'
 *   import { Button } from '@/components/ui/button';   // outside the anchor
 *
 *   // in src/lib/rsvp/waitlist.ts (anchor: src/lib/rsvp)
 *   import { DEFAULT_RSVP_RESPONSE_WINDOW_HOURS } from './constants';
 *
 * Only applies to files under src/. Non-code imports (CSS, JSON, images) are
 * left alone.
 */

import path from 'node:path';

const posix = path.posix;

/** `src` itself and its direct children (`src/app`, `src/lib`, ...). */
function isTopLevel(dir) {
  return dir === 'src' || posix.dirname(dir) === 'src';
}

function anchorFor(dir) {
  const parent = posix.dirname(dir);
  if (!isTopLevel(parent)) return parent;
  if (!isTopLevel(dir)) return dir;
  return null;
}

function isInside(target, dir) {
  return target === dir || target.startsWith(`${dir}/`);
}

/** CSS, JSON, images... anything whose last path segment has a non-code extension. */
function isAsset(source) {
  const last = source.split('/').pop();
  return /\.[a-z0-9]+$/i.test(last) && !/\.(ts|tsx|js|jsx|mjs)$/.test(last);
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description: 'Use relative imports for nearby files and the @/ alias for everything else.',
    },
    messages: {
      useRelative: "'{{source}}' is next to this file; import it as '{{fixed}}'.",
      useAlias: "'{{source}}' leaves this file's area; import it as '{{fixed}}'.",
    },
    schema: [],
  },
  create(context) {
    const relFile = path.relative(context.cwd, context.filename).split(path.sep).join('/');
    if (!relFile.startsWith('src/')) return {};
    const dir = posix.dirname(relFile);
    const anchor = anchorFor(dir);

    function check(node) {
      const sourceNode = node.source;
      const source = sourceNode?.value;
      if (typeof source !== 'string' || isAsset(source)) return;

      if (source.startsWith('@/')) {
        const target = `src/${source.slice(2)}`;
        if (!anchor || !isInside(target, anchor)) return;
        let fixed = posix.relative(dir, target);
        if (!fixed.startsWith('.')) fixed = `./${fixed}`;
        context.report({
          node: sourceNode,
          messageId: 'useRelative',
          data: { source, fixed },
          fix: (fixer) => fixer.replaceText(sourceNode, `'${fixed}'`),
        });
        return;
      }

      if (source.startsWith('.')) {
        const target = posix.normalize(posix.join(dir, source));
        if (anchor && isInside(target, anchor)) return;
        if (!target.startsWith('src/')) return;
        const fixed = `@/${target.slice('src/'.length)}`;
        context.report({
          node: sourceNode,
          messageId: 'useAlias',
          data: { source, fixed },
          fix: (fixer) => fixer.replaceText(sourceNode, `'${fixed}'`),
        });
      }
    }

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

export default rule;
