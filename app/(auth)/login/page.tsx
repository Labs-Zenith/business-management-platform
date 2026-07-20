import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getSession, getSavedAccounts } from "@/lib/session";
import LoginForm, { sanitizeNextPath } from "@/components/domain/auth/login-form";
import ProfilePicker from "@/components/domain/auth/profile-picker";

type LoginPageProps = {
  searchParams: Promise<{ next?: string; add?: string }>;
};

/**
 * `/login` server gate. Prior to this change the page was 100% client (see
 * `components/domain/auth/login-form.tsx`, extracted verbatim from what used
 * to live here). Now it resolves `getSavedAccounts()` (Wave 3 multi-account —
 * works WITHOUT an active session, see `lib/session.ts`) FIRST and decides:
 *
 *   - saved accounts exist AND the visitor did not explicitly ask to add a
 *     new one (`?add=1`) -> render `<ProfilePicker>` so an already-known
 *     device can re-enter with one click instead of retyping credentials
 *     (mirrors `business-switcher.tsx`'s "Otras cuentas" flow, but as the
 *     primary `/login` experience).
 *   - otherwise (no saved accounts, or `?add=1` from "Agregar cuenta") ->
 *     render `<LoginForm>`, the plain credential form.
 *
 * `getSession()` is resolved too (though not currently branched on) so a
 * future requirement — e.g. distinguishing "already signed in, landed on
 * /login by mistake" from "signed out, has saved accounts" — has it on hand
 * without another round trip.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  await loadStoreFromCookie();
  const params = await searchParams;
  const add = params.add === "1";
  const next = sanitizeNextPath(params.next ?? null) ?? undefined;

  const [, savedAccounts] = await Promise.all([getSession(), getSavedAccounts()]);

  if (savedAccounts.length > 0 && !add) {
    return <ProfilePicker accounts={savedAccounts} next={next} />;
  }

  return <LoginForm />;
}
