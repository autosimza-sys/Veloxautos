import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/pilot-authenticated.spec.mjs", "**/extra-controls.spec.mjs", "**/admin-controls.spec.mjs", "**/launch-adversarial.spec.mjs"],
  fullyParallel: true,
  projects: [
    { name: "desktop", use: { viewport: { width: 1366, height: 768 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  use: {
    baseURL: "http://127.0.0.1:3100",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", VELOX_AI_ENABLED: "false" },
  },
});
