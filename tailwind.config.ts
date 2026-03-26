import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        /* Core Semantic Colors */
        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',

        card: 'var(--color-card)',
        'card-foreground': 'var(--color-card-foreground)',

        popover: 'var(--color-popover)',
        'popover-foreground': 'var(--color-popover-foreground)',

        primary: 'var(--color-primary)',
        'primary-foreground': 'var(--color-primary-foreground)',

        secondary: 'var(--color-secondary)',
        'secondary-foreground': 'var(--color-secondary-foreground)',

        muted: 'var(--color-muted)',
        'muted-foreground': 'var(--color-muted-foreground)',

        accent: 'var(--color-accent)',
        'accent-foreground': 'var(--color-accent-foreground)',

        destructive: 'var(--color-destructive)',

        border: 'var(--color-border)',
        input: 'var(--color-input)',
        ring: 'var(--color-ring)',

        /* Sidebar */
        sidebar: 'var(--color-sidebar)',
        'sidebar-foreground': 'var(--color-sidebar-foreground)',
        'sidebar-primary': 'var(--color-sidebar-primary)',
        'sidebar-primary-foreground': 'var(--color-sidebar-primary-foreground)',
        'sidebar-accent': 'var(--color-sidebar-accent)',
        'sidebar-accent-foreground': 'var(--color-sidebar-accent-foreground)',
        'sidebar-border': 'var(--color-sidebar-border)',
        'sidebar-ring': 'var(--color-sidebar-ring)',

        /* Charts */
        'chart-1': 'var(--color-chart-1)',
        'chart-2': 'var(--color-chart-2)',
        'chart-3': 'var(--color-chart-3)',
        'chart-4': 'var(--color-chart-4)',
        'chart-5': 'var(--color-chart-5)',

        /* Homepage Colors */
        'pre-title-blue': 'var(--color-pre-title-blue)',
        'pre-title-orange': 'var(--color-pre-title-orange)',
        'pre-title-purple': 'var(--color-pre-title-purple)',
        description: 'var(--color-description)',
        'card-yellow': 'var(--color-card-yellow)',
        'card-skyblue': 'var(--color-card-skyblue)',
        'card-purple': 'var(--color-card-purple)',
        'card-red': 'var(--color-card-red)',
        'card-blue': 'var(--color-card-blue)',
        'card-text': 'var(--color-card-text)',
        'sponsor-button-blue': 'var(--color-sponsor-button-blue)',
      },

      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },

      backgroundImage: {
        'gradient-button': `
          linear-gradient(
            110deg,
            var(--color-gradient-1) 0%,
            var(--color-gradient-2) 15%,
            var(--color-gradient-3) 55%,
            var(--color-gradient-4) 80%,
            var(--color-gradient-5) 100%
          )
        `,
      },
    },
  },
} satisfies Config;
