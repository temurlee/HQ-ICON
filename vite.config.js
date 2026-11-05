import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { materialsMiddleware } from './server/appstoreMaterials.js'

const materials = () => ({
  name: 'appstore-materials',
  configureServer(server) {
    server.middlewares.use(materialsMiddleware)
  },
  configurePreviewServer(server) {
    server.middlewares.use(materialsMiddleware)
  },
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    materials()
  ],
  base: './',
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react')) {
            return 'react';
          }
        }
      }
    }
  }
})
