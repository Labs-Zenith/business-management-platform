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

/**
 * Port the suite drives, overridable with `E2E_PORT`. Defaults to 3000 so the
 * usual `npm run test:e2e` is unchanged; the override exists because another
 * project's dev server on 3000 would otherwise make the whole suite time out
 * (Next silently starts on 3001, while Playwright keeps polling 3000).
 */
const PORT = process.env.E2E_PORT || "3000";
const BASE_URL = `http://localhost:${PORT}`;

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
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...stringEnv(process.env),
      DEMO_LOGIN_EMAIL,
      DEMO_LOGIN_PASSWORD,
      // Must track the port, or every mutating request is rejected with
      // FORBIDDEN by `lib/server/origin-check.ts`.
      APP_ORIGIN: BASE_URL,
      // Force the zero-setup mock backend. The suite logs in with the demo
      // credentials, which exist only in `lib/mock/auth-adapter.ts` — and it
      // creates customers, invoices and payments as it runs, so pointing it at
      // a developer's real Supabase (whenever a .env.local happens to define
      // one) would both fail to authenticate AND write test rows into a real
      // database. `lib/db/client.ts` and `lib/supabase/config.ts` select their
      // backend on these being non-empty, and Next lets a real process env
      // value win over .env.local.
      POSTGRES_URL: "",
      DATABASE_URL: "",
      POSTGRES_URL_NON_POOLING: "",
      DATABASE_URL_UNPOOLED: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
  },
});
