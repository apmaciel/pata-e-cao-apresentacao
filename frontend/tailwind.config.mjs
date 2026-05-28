/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#06A5D2',
          dark:    '#0A3D3D',
          light:   '#E0F5F2',
        },
        cream: {
          DEFAULT: '#F7F3E6',
          tan:     '#E8D49E',
        },
        footer:  '#3B2315',
        accent:  '#F59E0B',
        tag: {
          notCastrated: '#9333EA',
          castrated:    '#00BFA5',
          dogs:         '#2563EB',
          cats:         '#78350F',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Montserrat', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
