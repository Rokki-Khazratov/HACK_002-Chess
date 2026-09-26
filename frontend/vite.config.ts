import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // In development the library API comes from `python -m library serve` (port 8765).
  server: {
    proxy: { '/api': 'http://127.0.0.1:8765' },
  },
})
