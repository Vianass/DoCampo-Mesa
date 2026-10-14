import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  css: { preprocessorOptions: { scss: { quietDeps: true, silenceDeprecations: ['import'] } } },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
