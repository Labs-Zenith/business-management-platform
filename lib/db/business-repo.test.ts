import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `lib/db/client.ts`'s exported `sql` is a Neon tagged-template function
 * (`neon(connectionString)`). Tagged-template syntax (`` sql`...${x}...` ``)
 * compiles to a plain function call `sql(stringsArray, x, ...)`, so mocking
 * `sql` as a `vi.fn()` and controlling its resolved value is sufficient —
 * no real Postgres connection is ever made. Mirrors the mock's own
 * `lib/mock/business-repo.test.ts` in scope (memberships shape, ordering,
 * empty-result case), adapted for the Postgres row shape
 * (`business_id`/`business_name`/`role`, per `MembershipRow` in
 * `lib/db/business-repo.ts`).
 */
const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock("./client", () => ({
  sql: mockSql,
  isDbConfigured: true,
}));

const { businessRepo } = await import("./business-repo");

const DEMO_USER_ID = "20000000-0000-4000-8000-000000000001";
const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const BUSINESS_ID_2 = "10000000-0000-4000-8000-000000000002";

describe("db businessRepo.listMembershipsForUser", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("returns the expected BusinessMembership[] shape mapped from mocked rows", async () => {
    mockSql.mockResolvedValueOnce([
      { business_id: BUSINESS_ID, business_name: "Negocio Demo", role: "admin" },
    ]);

    const memberships = await businessRepo.listMembershipsForUser(DEMO_USER_ID);

    expect(memberships).toEqual([
      { businessId: BUSINESS_ID, businessName: "Negocio Demo", role: "admin" },
    ]);
  });

  it("preserves the ORDER BY p.created_at ASC contract — result order matches the mocked row order, which the SQL clause itself is responsible for enforcing", async () => {
    // Rows are returned here in the exact order Postgres's `ORDER BY
    // p.created_at ASC` would produce (earliest membership first). This test
    // asserts the mapping step preserves that order; it does not (and
    // cannot, given the tagged-template mocking approach) re-verify the SQL
    // engine's own ordering guarantee — that's `ORDER BY`'s contract, not
    // this repository's.
    mockSql.mockResolvedValueOnce([
      { business_id: BUSINESS_ID, business_name: "Negocio Demo", role: "admin" },
      { business_id: BUSINESS_ID_2, business_name: "Negocio Demo 2", role: "admin" },
    ]);

    const memberships = await businessRepo.listMembershipsForUser(DEMO_USER_ID);

    expect(memberships.map((m) => m.businessId)).toEqual([BUSINESS_ID, BUSINESS_ID_2]);

    // Sanity-check the actual query text still contains the ORDER BY clause,
    // so a future edit that accidentally drops it fails this test too.
    const [strings] = mockSql.mock.calls[0]!;
    const queryText = Array.from(strings as unknown as string[]).join("");
    expect(queryText).toContain("ORDER BY p.created_at ASC");
  });

  it("returns [] cleanly for an empty result set", async () => {
    mockSql.mockResolvedValueOnce([]);

    const memberships = await businessRepo.listMembershipsForUser(DEMO_USER_ID);

    expect(memberships).toEqual([]);
  });
});
