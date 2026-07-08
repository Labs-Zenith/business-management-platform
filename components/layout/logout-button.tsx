"use client";

/**
 * Logs out via the existing `POST /api/auth/logout` route (PR2) and
 * redirects to `/login` on success, mirroring
 * `app/(auth)/login/page.tsx`'s fetch/redirect shape in reverse. Rendered
 * from `app/(dashboard)/layout.tsx`'s top bar so every `(dashboard)` screen
 * has a reachable logout action.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const GENERIC_ERROR_MESSAGE = "No se pudo cerrar sesion. Intenta de nuevo.";

export default function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });

      if (!response.ok) {
        setError(GENERIC_ERROR_MESSAGE);
        return;
      }

      router.push("/login");
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isSubmitting}
        onClick={handleLogout}
      >
        {isSubmitting ? "Saliendo..." : "Cerrar sesion"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
