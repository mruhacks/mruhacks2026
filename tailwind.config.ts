import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        'pre-title-blue': 'var(--color-pre-title-blue)',
        description: 'var(--color-description)',
      },
      backgroundImage: {
        'gradient-button': `
          linear-gradient(
            110deg,
            var(--gradient-color-1) 0%,
            var(--gradient-color-2) 15%,
            var(--gradient-color-3) 55%,
            var(--gradient-color-4) 80%,
            var(--gradient-color-5) 100%
          )
        `,
      },
    },
  },
} satisfies Config;
