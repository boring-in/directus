/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,vue}",
  ],
  safelist: [
    // Preload all color variations
    {
      pattern: /.+/, // This will match all classes
      variants: ['hover', 'focus', 'active', 'disabled', 'first', 'last', 'odd', 'even', 
                'sm', 'md', 'lg', 'xl', '2xl',
                'dark', 'light']
    }
  ],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["light", "dark"],
  }
}
