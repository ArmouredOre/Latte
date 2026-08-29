import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Served at the domain root on Vercel; GitHub Pages (npm run deploy) serves
// under /Latte/ and sets GH_PAGES=1 to switch the asset base path.
export default defineConfig({
  plugins: [react()],
  base: process.env.GH_PAGES ? '/Latte/' : '/',
})
