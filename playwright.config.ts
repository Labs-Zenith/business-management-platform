import { defineConfig, devices } from "@playwright/test";

/**
 * Demo credentials shared by `e2e/smoke.spec.ts` (browser login flow) and
 * `e2e/concurrency.spec.ts` (real-HTTP concurrency proof). Falls back to the
 * exact same defaults as `lib/mock/auth-adapter.ts`'s `resolveDemoCredentials()`
 * so the suite works out of the box without a `.env.local`. Forwarded
 * explicitly into `webServer.env` (in addition to the full inherited
 * `process.env`) so the spawned `next dev` process is guaranteed to agree
 * with whatever value the tests read, per `.env.example`'s
 * `DEMO_LOGIN_EMAIL`/`DEMO_LOGIN_PASSWORD`.
 */
const DEMO_LOGIN_EMAIL = process.env.DEMO_LOGIN_EMAIL || "demo@negociodemo.test";
const DEMO_LOGIN_PASSWORD = process.env.DEMO_LOGIN_PASSWORD || "demo1234";

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...stringEnv(process.env),
      DEMO_LOGIN_EMAIL,
      DEMO_LOGIN_PASSWORD,
    },
  },
});
