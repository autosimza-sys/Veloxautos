import base from './playwright.config.mjs';
import { defineConfig } from '@playwright/test';

// Browser + actual Supabase SDK, with every API call intercepted by the test.
// The reserved .invalid host can never be a production project.
export default defineConfig({
  ...base,
  testMatch: ['**/pilot-authenticated.spec.mjs', '**/extra-controls.spec.mjs', '**/admin-controls.spec.mjs'],
  testIgnore: [],
  workers: 2,
  timeout: 60_000,
  use: { ...base.use, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    ...base.webServer,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://pilot-supabase.invalid',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-public-anon-key-for-offline-tests',
      VELOX_AI_ENABLED: 'false',
    },
  },
});
