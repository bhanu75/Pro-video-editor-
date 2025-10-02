import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: '.', // Explicitly set root
  publicDir: 'public', // Explicitly set public directory
  server: {
    port: 3000
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  define: {
    // Enable environment variables
    'process.env': process.env
  }
})
