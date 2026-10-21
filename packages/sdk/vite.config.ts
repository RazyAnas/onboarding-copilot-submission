import { defineConfig } from "vite";
import { resolve } from "node:path";

// Builds the embeddable SDK as both an IIFE (script-tag drop-in) and ESM.
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "Copilot",
      fileName: (format) => `copilot.${format}.js`,
      formats: ["iife", "es"],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
