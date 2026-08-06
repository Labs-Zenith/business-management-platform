import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      /**
       * The codebase already writes deliberately-unused bindings with a
       * leading underscore — `_request` for a route handler that ignores its
       * argument, `_drop` for the destructuring idiom that omits a key, and
       * `_lowestPriceCents` for a sort-only field stripped before returning —
       * but the rule was left at its defaults, so every one of them reported
       * as an unused variable. Encoding the convention keeps the signal (a
       * genuinely forgotten variable still warns) without the noise.
       */
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
