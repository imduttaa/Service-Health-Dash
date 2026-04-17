import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@healthdash/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor bundles — recharts alone is ~400kb minified
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-charts': ['recharts'],
          'vendor-ui': ['lucide-react', 'clsx', 'tailwind-merge', 'date-fns'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy REST API calls to the BFF during development so the client
      // doesn't need to know the BFF port or deal with CORS in dev mode.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // WebSocket upgrade must be handled separately
        ws: false,
      },
    },
  },
});
