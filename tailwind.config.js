/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#FFFFFF',
        foreground: '#10162F',
        card: '#FFFFFF',
        'card-foreground': '#10162F',
        popover: '#FFFFFF',
        'popover-foreground': '#10162F',
        primary: '#625BF6',
        'primary-foreground': '#FFFFFF',
        secondary: '#EEEDFF',
        'secondary-foreground': '#34309F',
        muted: '#EFEEE9',
        'muted-foreground': '#667085',
        accent: '#E8F8F5',
        'accent-foreground': '#0F766E',
        destructive: '#E5484D',
        border: '#E5E3DD',
        input: '#DEDCD5',
        ring: '#625BF6',
        canvas: '#FFFFFF',
        ink: '#10162F',
        indigo: '#625BF6',
        mint: '#0F766E',
        coral: '#BE123C',
        lavender: '#EEEDFF',
      },
      fontFamily: {
        sans: ['Geist Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 16px 40px rgba(16, 22, 47, 0.08)',
        lift: '0 22px 60px rgba(16, 22, 47, 0.12)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
      },
    },
  },
  plugins: [],
}
