import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@appica') || id.includes('@radix-ui')) return 'appica-vendor';
          if (id.includes('@dnd-kit')) return 'dnd-vendor';
          if (id.includes('lucide-react')) return 'icons-vendor';
          return 'vendor';
        },
      },
    },
  },
}));
