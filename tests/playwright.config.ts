import { defineConfig } from "@playwright/test";

const PORT = 5180;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    headless: true,
  },
  webServer: [
    {
      command: `pnpm --filter @copilot/demo exec vite --port ${PORT} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Fresh in-memory DB so onboarding/funnel state is deterministic per run
      // (both demo flows pending, no carried-over completions). Never reuse a
      // long-running dev backend, which would have accumulated state.
      command: `DB_PATH=:memory: pnpm --filter @copilot/server start`,
      url: "http://localhost:8787/health",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
