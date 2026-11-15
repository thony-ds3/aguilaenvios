// [FE] PostCSS de este proyecto (Vite).
// Tailwind 4 se procesa con el plugin `@tailwindcss/vite` declarado en vite.config.ts,
// por lo que aquí no hace falta ningún plugin de PostCSS.
// La existencia de este archivo también impide que Vite suba a la carpeta padre y cargue
// el postcss.config.mjs del proyecto Next.js (que usa @tailwindcss/postcss y no está instalado aquí).
export default {
  plugins: {},
};
