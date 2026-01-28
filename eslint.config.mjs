import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginBetterTailwindcss from "eslint-plugin-better-tailwindcss";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    plugins: {
      "better-tailwindcss": eslintPluginBetterTailwindcss,
    },
    rules: {
      // Enable recommended Tailwind CSS rules
      ...eslintPluginBetterTailwindcss.configs["recommended-warn"].rules,
      // Disable Prettier-conflicting ESLint rules
      ...eslintConfigPrettier.rules,
    },
    settings: {
      "better-tailwindcss": {
        // Tailwind CSS v4: path to the entry file of the CSS-based Tailwind config
        entryPoint: "src/app/globals.css",
      },
    },
  },
];

export default eslintConfig;
