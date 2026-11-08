import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/pwa",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "allow",
  },
  webServer: {
    command: "node tests/pwa/server.mjs",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
  },
});
