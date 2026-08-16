// Mirrors desktop/postcss.config.js. Without this, Vite never invokes
// `@tailwindcss/postcss` for CSS loaded in this project, so `@import
// "tailwindcss";` in the reused `desktop/src/shared/styles/globals.css`
// passes through unprocessed and every Tailwind utility class in the reused
// desktop tree renders as if no stylesheet existed at all.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
