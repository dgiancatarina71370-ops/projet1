import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  base: './',
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString()) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: 'dist', target: 'es2021' },
  server: { port: 1420, strictPort: true },
});
