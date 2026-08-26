import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: {
    // build stamp in AEST (GMT+10, no DST adjustment)
    __BUILD_DATE__: JSON.stringify(
      new Date(Date.now() + 10 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') + ' AEST',
    ),
  },
  build: {
    target: 'es2020',
  },
});
