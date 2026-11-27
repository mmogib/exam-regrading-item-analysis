import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    // Mirror the "@/*" path alias from tsconfig.json
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    // jsdom provides File, FileReader, Blob and document, which the
    // upload/download code in lib/ relies on
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
