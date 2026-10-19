import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // In-process Postgres (PGlite) takes a few seconds to boot when files start in parallel.
    hookTimeout: 60_000,
  },
});
