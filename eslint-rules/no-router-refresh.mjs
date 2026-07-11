/**
 * ESLint rule: no-router-refresh
 *
 * Warns on calls to `router.refresh()` from `next/navigation`.
 *
 * `router.refresh()` is a blunt instrument for reloading stale data — it
 * re-runs every server component in the tree and discards client state.
 * Prefer targeted cache invalidation with TanStack Query
 * (`queryClient.invalidateQueries({ queryKey: [...] })`) when reloading data
 * fetched through `useQuery`.
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow router.refresh() — use TanStack Query invalidation for reloading stale data.',
    },
    messages: {
      noRouterRefresh:
        'Avoid router.refresh() for reloading stale data. Use queryClient.invalidateQueries({ queryKey: [...] }) from @tanstack/react-query instead.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'refresh'
        ) {
          return;
        }

        // Match `<ident>.refresh()` where the ident came from `useRouter()`.
        // We detect this by walking the scope chain for the variable
        // binding and checking if any of its definitions was initialized
        // from a call to `useRouter`.
        if (callee.object.type !== 'Identifier') return;

        const scope = context.sourceCode.getScope(node);
        const variable = findVariable(scope, callee.object.name);
        if (!variable) return;

        const fromUseRouter = variable.defs.some((def) => {
          const init = def.node.init;
          return (
            init &&
            init.type === 'CallExpression' &&
            init.callee.type === 'Identifier' &&
            init.callee.name === 'useRouter'
          );
        });

        if (!fromUseRouter) return;

        context.report({
          node,
          messageId: 'noRouterRefresh',
        });
      },
    };
  },
};

function findVariable(scope, name) {
  for (let s = scope; s; s = s.upper) {
    const v = s.variables.find((v) => v.name === name);
    if (v) return v;
  }
  return null;
}

export default rule;
