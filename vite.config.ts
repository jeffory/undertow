import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: {
    __BUILD_DATE__: JSON.stringify(
      new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
    ),
  },
  build: {
    target: 'es2020',
  },
});
