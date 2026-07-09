import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

/**
 * Root route (`/`). This app has no public marketing/landing content, so
 * `/` is purely a dispatcher: authenticated visitors go straight to
 * `/dashboard`, everyone else to `/login`. `middleware.ts` intentionally
 * does not guard `/` itself (only the `(dashboard)`/`(print)` route
 * groups' prefixes) — this page is what used to be create-next-app's
 * default scaffold content, replaced here since nothing else in the app
 * ever redirected `/` anywhere.
 */
export default async function Home() {
  const session = await getSession();
  redirect(session ? "/dashboard" : "/login");
}
