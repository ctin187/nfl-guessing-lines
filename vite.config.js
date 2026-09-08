import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative so the build works at a domain root or under any subpath.
  base: './',
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: { target: 'es2020' },
})
