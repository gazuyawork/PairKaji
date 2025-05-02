/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      './src/app/**/*.{js,ts,jsx,tsx}',
      './src/components/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
      extend: {
        fontFamily: {
          sans: ['var(--font-zen)', 'Meiryo', 'sans-serif'],
          pacifico: ['var(--font-pacifico)', 'cursive'],
        },
      },
    },
    plugins: [],
  };
  