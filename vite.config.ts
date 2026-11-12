import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the same artefact works from a repository subpath
// (GitHub Pages) and from a file:// copy on a developer's laptop.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
})
