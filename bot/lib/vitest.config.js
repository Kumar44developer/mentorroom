import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["lib/**/*.js", "index.js"],
      exclude: ["node_modules", "__tests__"],
    },
    include: ["__tests__/**/*.test.js"],
    testTimeout: 10000,
    // Restore all mocks between tests to prevent state leakage.
    restoreMocks: true,
  },
});
