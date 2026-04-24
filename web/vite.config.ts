import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ff/shared': fileURLToPath(new URL('../shared/types.ts', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4444',
      '/ws': { target: 'ws://localhost:4444', ws: true },
    },
  },
});
