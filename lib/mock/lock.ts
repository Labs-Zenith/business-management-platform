/**
 * Keyed async mutex (promise-chain lock) used by the mock repositories to
 * serialize read-check-write sequences that must be atomic:
 * - invoice creation locks on `businessId` (per-business numbering)
 * - payment registration locks on `invoiceId` (overpay-safe balance check)
 *
 * The lock holds across `await` points because each key's chain is a single
 * promise: the next waiter's `fn` is only invoked once the previous holder's
 * `fn` has fully settled (resolved or rejected). This is correct for a
 * single Node.js process/event loop; it is NOT a cross-process lock — the
 * real Supabase swap must use a DB transaction / `SELECT ... FOR UPDATE`.
 */

const chains = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();

  // Run `fn` only after the previous holder (if any) has fully settled,
  // regardless of whether it resolved or rejected — a failure must not
  // deadlock subsequent waiters on the same key.
  const result = previous.then(fn, fn);

  // Store a normalized (always-resolves) continuation as the new tail of the
  // chain so a rejection doesn't propagate into the *next* waiter's `previous`.
  chains.set(
    key,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );

  return result;
}
