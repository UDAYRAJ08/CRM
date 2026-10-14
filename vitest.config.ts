import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so tests don't load the LinkedIn dev-server middleware.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
