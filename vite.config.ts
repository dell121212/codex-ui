import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  envPrefix: ['VITE_', 'NL_*'],
  clearScreen: false,

  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/.storage/**', '**/dist/**', '**/neutralino-dist/**'],
    },
  },

  build: {
    target: 'es2021',
    minify: 'esbuild',
    sourcemap: false,
  },
}));
