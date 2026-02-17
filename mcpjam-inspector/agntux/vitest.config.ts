import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    root: path.dirname(new URL(import.meta.url).pathname),
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
