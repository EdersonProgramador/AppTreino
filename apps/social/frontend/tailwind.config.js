/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    './src/hooks/**/*.{js,ts,jsx,tsx}',
    './src/lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#172033',
        mist: '#f4f7fb',
        brand: '#2f5bac',
        accent: '#f97316',
      },
      fontFamily: {
        sans: ['Ubuntu', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 18px 50px rgba(23, 32, 51, 0.10)',
      },
    },
  },
  plugins: [],
};
