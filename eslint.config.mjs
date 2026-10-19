import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Sondo
    "spike/output/**",
    "playwright-report/**",
    "test-results/**",
    // Vendored pixel-meadow scene generator (IIFE, not application code).
    "lib/pixel-scene/pixel-scene.js",
  ]),
]);

export default eslintConfig;
