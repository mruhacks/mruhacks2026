/**
 * ESLint rule: no-nested-interactive
 *
 * Disallows wrapping interactive components (Button) inside Link,
 * which produces invalid nested interactive HTML elements (<a> containing <button>).
 *
 * Instead, use <Button asChild><Link>...</Link></Button>.
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Link wrapping Button (nested interactive elements). Use <Button asChild> with <Link> as a child instead.',
    },
    messages: {
      noLinkWrappingButton:
        '<Link> wrapping <Button> creates invalid nested interactive elements. Use <Button asChild><Link>…</Link></Button> instead.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXElement(node) {
        const opening = node.openingElement;
        if (
          opening.name.type !== 'JSXIdentifier' ||
          opening.name.name !== 'Link'
        ) {
          return;
        }

        for (const child of node.children) {
          if (child.type !== 'JSXElement') continue;

          const childName = child.openingElement.name;
          if (
            childName.type === 'JSXIdentifier' &&
            childName.name === 'Button'
          ) {
            context.report({
              node: child,
              messageId: 'noLinkWrappingButton',
            });
          }
        }
      },
    };
  },
};

export default rule;
