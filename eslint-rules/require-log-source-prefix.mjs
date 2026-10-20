/**
 * ESLint rule: require-log-source-prefix
 *
 * Diagnostic logs must start with a source prefix so a line can be traced
 * without a stack: `[cron/rsvp] completed`, `[auth] sendMagicLink failed`.
 *
 * The tag is lowercase kebab-case segments separated by `/`, then a space,
 * then the message. Extra details stay in later arguments.
 */

const CONSOLE_METHODS = new Set([
  'log',
  'info',
  'warn',
  'error',
  'debug',
  'trace',
]);

/** `[segment] ` or `[segment/segment] `, segments are kebab-case. */
const SOURCE_TAG = String.raw`\[(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)\]`;

/** A finished message: tag, space, then at least one non-space character. */
const FULL_MESSAGE = new RegExp(`^${SOURCE_TAG} \\S`);

/** A template head that already contains the tag and the separating space. */
const TEMPLATE_HEAD = new RegExp(`^${SOURCE_TAG} `);

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require console messages to start with a [source] prefix that identifies where the log came from.',
    },
    messages: {
      missingPrefix:
        'Start this log with a source prefix, e.g. console.error(\'[cron/rsvp] failed\', error). Use lowercase kebab-case segments separated by "/".',
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
          callee.object.type !== 'Identifier' ||
          callee.object.name !== 'console' ||
          callee.property.type !== 'Identifier' ||
          !CONSOLE_METHODS.has(callee.property.name)
        ) {
          return;
        }

        const message = node.arguments[0];
        if (!message || !messageHasPrefix(message)) {
          context.report({
            node: message ?? node,
            messageId: 'missingPrefix',
          });
        }
      },
    };
  },
};

function messageHasPrefix(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return FULL_MESSAGE.test(node.value);
  }

  if (node.type === 'TemplateLiteral') {
    const head = node.quasis[0]?.value.cooked ?? '';
    if (node.expressions.length === 0) return FULL_MESSAGE.test(head);
    return TEMPLATE_HEAD.test(head);
  }

  if (node.type === 'ConditionalExpression') {
    return (
      messageHasPrefix(node.consequent) && messageHasPrefix(node.alternate)
    );
  }

  return false;
}

export default rule;
