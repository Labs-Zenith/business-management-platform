import { describe, expect, it } from "vitest";
import { withLock } from "./lock";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("withLock", () => {
  it("serializes concurrent calls that share the same key", async () => {
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;

    async function task(label: string, ms: number) {
      return withLock("shared-key", async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        order.push(`start:${label}`);
        await delay(ms); // real async work — forces genuine interleaving if unlocked
        order.push(`end:${label}`);
        active -= 1;
        return label;
      });
    }

    // Fire genuinely concurrent calls via Promise.all, NOT sequential awaits.
    // If withLock did nothing, the longer delay (A=30ms) would finish AFTER
    // the shorter ones (B=10ms, C=5ms), producing interleaved start/end pairs.
    const results = await Promise.all([task("A", 30), task("B", 10), task("C", 5)]);

    expect(results).toEqual(["A", "B", "C"]);
    // Never more than one holder of the lock at any instant.
    expect(maxActive).toBe(1);
    // Each holder's start/end must be back-to-back (no interleaving), in
    // strict FIFO acquisition order.
    expect(order).toEqual(["start:A", "end:A", "start:B", "end:B", "start:C", "end:C"]);
  });

  it("does not serialize calls with different keys — they run concurrently", async () => {
    const order: string[] = [];

    async function task(key: string, label: string, ms: number) {
      return withLock(key, async () => {
        order.push(`start:${label}`);
        await delay(ms);
        order.push(`end:${label}`);
      });
    }

    // A has the longer delay but a different key than B; if locking were
    // global (not keyed), B would be blocked behind A and finish last.
    await Promise.all([task("key-1", "A", 30), task("key-2", "B", 5)]);

    expect(order.indexOf("end:B")).toBeLessThan(order.indexOf("end:A"));
  });

  it("still releases the lock for the next holder when a holder's fn rejects", async () => {
    const order: string[] = [];

    await expect(
      withLock("fail-key", async () => {
        order.push("first");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const result = await withLock("fail-key", async () => {
      order.push("second");
      return "ok";
    });

    expect(result).toBe("ok");
    expect(order).toEqual(["first", "second"]);
  });
});
