import { defineConfig } from "vite";
const buildId = new Date().toISOString();
export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    {
      name: "build-identity",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "build.json",
          source: JSON.stringify({ id: buildId }),
        });
      },
    },
  ],
  server: {
    host: "0.0.0.0",
    strictPort: true,
    watch: { usePolling: true, interval: 500 },
    proxy: { "/api": { target: "http://web", changeOrigin: false } },
  },
});
