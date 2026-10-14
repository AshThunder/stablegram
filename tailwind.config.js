/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#00486d',
          container: '#006190',
          fixed: '#cbe6ff',
          'fixed-dim': '#8ecdff',
        },
        tertiary: {
          DEFAULT: '#004f1c',
          container: '#006a28',
          fixed: '#9af8a2',
        },
        error: {
          DEFAULT: '#ba1a1a',
          container: '#ffdad6',
        },
        cta: { DEFAULT: '#3D95CE' },
        logo: '#1ca8f0',
        background: '#f9f9fa',
        surface: {
          DEFAULT: '#f9f9fa',
          variant: '#e2e2e3',
          container: {
            DEFAULT: '#eeeeef',
            low: '#f3f3f4',
            lowest: '#ffffff',
            high: '#e8e8e9',
          },
        },
        outline: {
          DEFAULT: '#707880',
          variant: '#bfc7d1',
        },
        on: {
          primary: '#ffffff',
          background: '#1a1c1d',
          surface: '#1a1c1d',
          'surface-variant': '#40484f',
          error: '#ffffff',
        },
      },
      borderRadius: { card: '24px' },
      spacing: {
        'container-padding': '20px',
      },
      fontSize: {
        'headline-md': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'headline-sm': ['18px', { lineHeight: '24px', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-md': ['14px', { lineHeight: '20px', fontWeight: '600' }],
        'label-sm': ['12px', { lineHeight: '16px', fontWeight: '500' }],
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
