/**
 * ESLint rule: enforce-mruhacks-naming
 *
 * Ensures that the event name is always spelled as "MRUHacks" (not "MRU Hacks" with space,
 * or other variations). This applies to string literals in the codebase.
 *
 * Exceptions:
 * - URLs and email addresses (mruhacks.ca, etc.) are exempt
 * - Package names and identifiers are exempt
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce "MRUHacks" spelling (not "MRU Hacks" or other variations)',
    },
    messages: {
      incorrectSpelling:
        'Event name should be "MRUHacks" (no space). Found: "{{ actual }}"',
      useCorrectFormat: 'Use "MRUHacks" instead of "{{ actual }}"',
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;

        const value = node.value;

        // Skip URLs, email addresses, and paths
        if (
          value.includes('@') ||
          value.includes('/') ||
          value.includes('http') ||
          value.includes('.ca') ||
          value.includes('.com')
        ) {
          return;
        }

        // Check for "MRU Hacks" (with space)
        if (value.includes('MRU Hacks')) {
          context.report({
            node,
            messageId: 'incorrectSpelling',
            data: { actual: 'MRU Hacks' },
            fix(fixer) {
              const newValue = value.replace(/MRU Hacks/g, 'MRUHacks');
              return fixer.replaceText(node, JSON.stringify(newValue));
            },
          });
        }

        // Check for "mru hacks" (all lowercase with space)
        if (value.toLowerCase().includes('mru hacks') && !value.includes('MRU Hacks')) {
          context.report({
            node,
            messageId: 'useCorrectFormat',
            data: { actual: value.match(/mru\s+hacks/i)[0] },
            fix(fixer) {
              const newValue = value.replace(/mru\s+hacks/gi, 'MRUHacks');
              return fixer.replaceText(node, JSON.stringify(newValue));
            },
          });
        }
      },

      TemplateElement(node) {
        const value = node.value.cooked;
        if (!value) return;

        // Skip URLs and email addresses
        if (
          value.includes('@') ||
          value.includes('/') ||
          value.includes('http') ||
          value.includes('.ca') ||
          value.includes('.com')
        ) {
          return;
        }

        // Check for "MRU Hacks" (with space)
        if (value.includes('MRU Hacks')) {
          context.report({
            node,
            messageId: 'incorrectSpelling',
            data: { actual: 'MRU Hacks' },
          });
        }

        // Check for "mru hacks" (all lowercase with space)
        if (value.toLowerCase().includes('mru hacks') && !value.includes('MRU Hacks')) {
          const matched = value.match(/mru\s+hacks/i);
          context.report({
            node,
            messageId: 'useCorrectFormat',
            data: { actual: matched?.[0] || 'mru hacks' },
          });
        }
      },
    };
  },
};

export default rule;
