import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages liefert die Seite unter /haushaltsboard/ aus
export default defineConfig({
  base: '/Haushaltsboard/',
  plugins: [react(), tailwindcss()],
})
