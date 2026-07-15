"use client";

import { useState, Suspense, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Present when navigated here via "Agregar cuenta" (see
  // `business-switcher.tsx`) — signals this login is meant to ADD a new
  // account alongside the one(s) already saved on this device, and where to
  // return to afterwards, instead of hard-bouncing to `/dashboard`.
  const nextPath = sanitizeNextPath(searchParams.get("next"));
  const isAddAccountFlow = nextPath !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
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
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{isAddAccountFlow ? "Agregar otra cuenta" : "Iniciar sesion"}</CardTitle>
          <CardDescription>
            {isAddAccountFlow
              ? "Ingresa las credenciales de la cuenta que quieres agregar."
              : "Ingresa tus credenciales para continuar."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Contrasena</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={isSubmitting} className="w-full">
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
