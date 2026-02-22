import { defineConfig } from "vitest/config";
import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "@/shared": path.resolve(__dirname, "../shared"),
    },
  },
  test: {
    root: __dirname,
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
