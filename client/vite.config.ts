import { defineConfig } from 'vite';
export default defineConfig({ server: {
  host: '0.0.0.0', strictPort: true,
  watch: { usePolling: true, interval: 500 },
  proxy: { '/api': { target: 'http://web', changeOrigin: false } },
} });
