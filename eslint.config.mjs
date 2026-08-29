import eslintConfigNextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import eslintConfigNextTypescript from 'eslint-config-next/typescript';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginBetterTailwindcss from 'eslint-plugin-better-tailwindcss';
import noNestedInteractive from './eslint-rules/no-nested-interactive.mjs';
import noRouterRefresh from './eslint-rules/no-router-refresh.mjs';
import enforceMRUHacksNaming from './eslint-rules/enforce-mruhacks-naming.mjs';

const eslintConfig = [
  ...eslintConfigNextCoreWebVitals,
  ...eslintConfigNextTypescript,
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'src/components/ui/**',
      'eslint-rules/**',
    ],
  },
  {
    plugins: {
      'better-tailwindcss': eslintPluginBetterTailwindcss,
      custom: {
        rules: {
          'no-nested-interactive': noNestedInteractive,
          'no-router-refresh': noRouterRefresh,
          'enforce-mruhacks-naming': enforceMRUHacksNaming,
        },
      },
    },
    rules: {
      'custom/no-nested-interactive': 'error',
      'custom/no-router-refresh': 'warn',
      'custom/enforce-mruhacks-naming': 'error',
      // Enable recommended Tailwind CSS rules
      ...eslintPluginBetterTailwindcss.configs['recommended-warn'].rules,
      // Disable Prettier-conflicting ESLint rules
      ...eslintConfigPrettier.rules,
      // Disable formatting rules that conflict with prettier-plugin-tailwindcss
      // Prettier handles class ordering and line wrapping
      'better-tailwindcss/enforce-consistent-class-order': 'off',
      'better-tailwindcss/enforce-consistent-line-wrapping': 'off',
      'better-tailwindcss/no-unnecessary-whitespace': 'off',
    },
    settings: {
      'better-tailwindcss': {
        // Tailwind CSS v4: path to the entry file of the CSS-based Tailwind config
        entryPoint: 'src/app/globals.css',
      },
    },
  },
];

export default eslintConfig;
