/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        main: '#171717',
        sidebar: '#151515',
        chat: '#202020',
        message: '#303030',
        userbubble: '#E6E4E0',
        primary: '#F5F5F5',
        secondary: '#A0A0A0',
        accent: '#E9A23B',
        success: '#36C99A',
        danger: '#EF6464',
      },
    },
  },
  plugins: [],
};

