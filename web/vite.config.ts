import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
