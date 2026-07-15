import { z } from "zod";

/**
 * Global Zod v4 locale = Spanish. Configures the default error messages once
 * for the whole app so every schema's built-in validation errors (required,
 * email, min/max, etc.) render in Spanish for the live/inline form validation
 * (`lib/hooks/use-zod-form.ts`, react-hook-form `zodResolver`s) AND for the
 * API routes' `safeParse`. Imported as a side effect at the top of every
 * `lib/schemas/*` file, so the config runs before any `.parse`/`.safeParse`,
 * on both the client and server bundles.
 *
 * Field-specific custom messages (passed explicitly in a schema) still
 * override this locale, so specific fields can read more naturally where it
 * matters.
 */
z.config(z.locales.es());
