"use client";

import { useState, Suspense, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { Building2, Eye, EyeOff } from "lucide-react";
import { usernameToEmail } from "@/lib/auth/username";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const GENERIC_ERROR_MESSAGE = "No se pudo iniciar sesion. Verifica tus datos e intenta de nuevo.";

/**
 * Login is USERNAME + password — no email validation. Supabase Auth is
 * email-based under the hood, so `usernameToEmail` appends the internal domain
 * to a plain username before submit (see `lib/auth/username.ts`); a value that
 * already contains `@` (e.g. the legacy `demo@negociodemo.test`) passes
 * through unchanged, so both still work. The field only requires a non-empty
 * value — we intentionally do NOT enforce email format, since users sign in
 * with a bare username. Client-side UX only (inline error + disabling the
 * button); the API route re-validates server-side (source of truth).
 */
const identifierSchema = z.string().trim().min(1, "El usuario es obligatorio.");
const passwordSchema = z.string().min(1, "La contraseña es obligatoria.");

/**
 * Only a same-origin relative path (starting with a single `/`) is ever
 * honored as a post-login redirect target — this is the "Agregar cuenta"
 * flow's `?next=<path>` (see `components/layout/business-switcher.tsx`),
 * NOT an arbitrary caller-controlled value, so this guards against an open
 * redirect (`//evil.com`, `https://evil.com`, etc.) being smuggled through
 * the query string.
 */
function sanitizeNextPath(next: string | null): string | null {
  // Only a same-origin ABSOLUTE path is honored. Reject: non-`/`-leading
  // values, `//host` (protocol-relative), and ANY backslash — browsers'
  // WHATWG URL parser treats `\` like `/`, so `/\evil.com` would normalize to
  // `https://evil.com` and `router.push` it as a full external navigation
  // (open-redirect). A legitimate in-app path never contains a backslash.
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return null;
  }
  return next;
}

interface Touched {
  email: boolean;
  password: boolean;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<Touched>({ email: false, password: false });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Present when navigated here via "Agregar cuenta" (see
  // `business-switcher.tsx`) — signals this login is meant to ADD a new
  // account alongside the one(s) already saved on this device, and where to
  // return to afterwards, instead of hard-bouncing to `/dashboard`.
  const nextPath = sanitizeNextPath(searchParams.get("next"));
  const isAddAccountFlow = nextPath !== null;

  const emailResult = identifierSchema.safeParse(email);
  const passwordResult = passwordSchema.safeParse(password);
  const emailError = emailResult.success ? null : emailResult.error.issues[0]?.message;
  const passwordError = passwordResult.success ? null : passwordResult.error.issues[0]?.message;
  const isFormValid = emailResult.success && passwordResult.success;

  function markTouched(field: keyof Touched) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: usernameToEmail(email), password }),
      });

      if (!response.ok) {
        const body: { error?: { message?: string } } | null = await response
          .json()
          .catch(() => null);
        setError(body?.error?.message ?? GENERIC_ERROR_MESSAGE);
        return;
      }

      router.push(nextPath ?? "/dashboard");
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-1 flex items-center justify-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Building2 className="size-4" />
            </div>
            <span className="text-sm font-medium">Panel de negocio</span>
          </div>
          <CardTitle>{isAddAccountFlow ? "Agregar otra cuenta" : "Iniciar sesión"}</CardTitle>
          <CardDescription>
            {isAddAccountFlow
              ? "Ingresa las credenciales de la cuenta que quieres agregar."
              : "Ingresa tus credenciales para continuar."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Usuario</Label>
              <Input
                id="email"
                name="email"
                type="text"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => markTouched("email")}
              />
              {touched.email && emailError ? (
                <p className="text-xs text-destructive">{emailError}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="pr-10"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onBlur={() => markTouched("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-muted-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {touched.password && passwordError ? (
                <p className="text-xs text-destructive">{passwordError}</p>
              ) : null}
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={isSubmitting || !isFormValid} className="w-full">
              {isSubmitting ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * `useSearchParams()` (read in `LoginForm` for the "Agregar cuenta" `?next=`
 * flow) requires a `<Suspense>` boundary in the App Router — without it the
 * `/login` page fails to prerender at build time. The fallback is `null`: the
 * form renders instantly on the client and there is no meaningful server shell
 * to show.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
