import { defineConfig } from 'vite';

// Dev: served at http://localhost:5173/  and /ws is proxied to the relay.
// Build: served by the relay at /host/ so one port (one tunnel) covers everything.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/host/' : '/',
  server: {
    allowedHosts: true,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
}));
