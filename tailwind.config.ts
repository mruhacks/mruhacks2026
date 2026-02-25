import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        'pre-title-blue': 'var(--color-pre-title-blue)',
        description: 'var(--color-description)',
        'card-color1': 'var(--color-card-color1)',
        'card-color2': 'var(--color-card-color2)',
        'card-color3': 'var(--color-card-color3)',
        'card-color4': 'var(--color-card-color4)',
        'card-color5': 'var(--color-card-color5)',
        'card-text': 'var(--color-card-text)',
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
