import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['api/**/*.js', 'squads/caixa-escolar/dashboard/js/**/*.js'],
      exclude: ['**/node_modules/**', '**/tests/**']
    }
  }
});
