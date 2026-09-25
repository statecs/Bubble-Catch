import { defineConfig } from 'vite';

// Dev: http://localhost:5174/ ; /ws proxied to the relay so a tunnel to 5174 alone works for phones.
// Build: served by the relay at / .
export default defineConfig({
  base: '/',
  server: {
    allowedHosts: true,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
