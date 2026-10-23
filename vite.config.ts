import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the production build works from any folder / iframe (Poki uploads, file hosts).
  base: './',
  server: { host: true, port: 5173 },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
