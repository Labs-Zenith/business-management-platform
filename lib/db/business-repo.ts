import type { Business, BusinessMembership, BusinessRepository, BusinessUpdate, Role } from "@/lib/services/ports";
import { sql } from "./client";

type BusinessRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
};

type MembershipRow = {
  business_id: string;
  business_name: string;
  role: Role;
};

function toBusiness(row: BusinessRow): Business {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    currency: row.currency,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function toMembership(row: MembershipRow): BusinessMembership {
  return { businessId: row.business_id, businessName: row.business_name, role: row.role };
}

export const businessRepo: BusinessRepository = {
  async getById(businessId: string): Promise<Business | null> {
    const rows = (await sql`SELECT * FROM businesses WHERE id = ${businessId}`) as unknown as BusinessRow[];
    return rows[0] ? toBusiness(rows[0]) : null;
  },

  /**
   * INNER JOIN means an orphaned membership (a `profiles` row whose
   * `business_id` doesn't resolve to a real `businesses` row) is excluded
   * from the result set. Unlike the mock backend — a plain `Map` with no
   * referential integrity, where an orphaned entry is a real, reachable
   * state that `lib/mock/business-repo.ts` must explicitly skip — this case
   * is actually structurally UNREACHABLE in Postgres: `profiles.business_id`
   * is `NOT NULL REFERENCES businesses(id)` with the default `RESTRICT`
   * delete action (no `ON DELETE CASCADE`/`SET NULL`; see
   * `migrations/1700000000000_baseline.sql`), so a `profiles` row can never
   * outlive the `businesses` row it references.
   */
  async listMembershipsForUser(userId: string): Promise<BusinessMembership[]> {
    const rows = (await sql`
      SELECT b.id AS business_id, b.name AS business_name, p.role
      FROM profiles p
      JOIN businesses b ON b.id = p.business_id
      WHERE p.user_id = ${userId}
      ORDER BY p.created_at ASC
    `) as unknown as MembershipRow[];
    return rows.map(toMembership);
  },

  /**
   * Single `UPDATE ... WHERE id = ... RETURNING *` statement — unlike
   * `customer-repo.ts#update` (which fetches first to verify the customer's
   * `business_id` matches the caller's, since a customer id could belong to
   * a different business), a business's own `id` IS the scoping value
   * itself: there is no separate ownership check to make.
   * `COALESCE(${...}, column)` leaves any field the caller didn't include
   * (`undefined` -> `null` param binding is never sent for those; instead we
   * pass the existing sentinel `null` through COALESCE) untouched.
   */
  async update(businessId: string, data: BusinessUpdate): Promise<Business | null> {
    const rows = (await sql`
      UPDATE businesses SET
        name = COALESCE(${data.name ?? null}, name),
        phone = COALESCE(${data.phone ?? null}, phone),
        email = COALESCE(${data.email ?? null}, email),
        address = COALESCE(${data.address ?? null}, address),
        currency = COALESCE(${data.currency ?? null}, currency),
        updated_at = now()
      WHERE id = ${businessId}
      RETURNING *
    `) as unknown as BusinessRow[];
    return rows[0] ? toBusiness(rows[0]) : null;
  },
};
