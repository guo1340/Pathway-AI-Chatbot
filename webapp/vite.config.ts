import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, cors: true, origin: 'http://localhost:5173' },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: './index.html',
      output: { entryFileNames: 'assets/main.js', assetFileNames: 'assets/[name][extname]' }
    }
  }
})