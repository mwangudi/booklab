/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        // Public website (Stitch "Booklab Institutional & Retail" design, docs/DESIGN-website.md).
        // Namespaced so the staff portal's look is untouched.
        site: {
          ochre: '#C25608',
          'ochre-dark': '#A84705',
          'ochre-tint': '#FFFBEB',
          navy: '#0F172A',
          azure: '#0284C7',
          'azure-tint': '#E0F2FE',
          'azure-ink': '#0369A1',
          sage: '#F0FDF4',
          'sage-ink': '#15803D',
          canvas: '#FDFCF9',
          alt: '#F8FAFC',
          line: '#E2E8F0',
          'line-strong': '#CBD5E1',
          muted: '#64748B',
          ink: '#1A1C1A',
        },
      },
      boxShadow: {
        'site-1': '0 1px 3px 0 rgba(15, 23, 42, 0.05)',
        'site-2': '0 4px 12px -2px rgba(194, 86, 8, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04)',
        'site-3': '0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.06)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'sans-serif'],
        site: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
