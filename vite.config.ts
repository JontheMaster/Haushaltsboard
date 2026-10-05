import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages liefert die Seite unter /Haushaltsboard/ aus (Groß-/Kleinschreibung zählt)
export default defineConfig({
  base: '/Haushaltsboard/',
  plugins: [react(), tailwindcss()],
})
