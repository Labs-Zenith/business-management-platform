import type { Business, BusinessMembership, BusinessRepository } from "@/lib/services/ports";
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

export const businessRepo: BusinessRepository = {
  async getById(businessId: string): Promise<Business | null> {
    const rows = (await sql`SELECT * FROM businesses WHERE id = ${businessId}`) as unknown as BusinessRow[];
    return rows[0] ? toBusiness(rows[0]) : null;
  },

  /**
   * Type-satisfying stub only — deliberately NOT implemented in this PR
   * (roles-multi-business Work Unit 1 / PR 1 is mock-backend-only per
   * `tasks.md`). The real SQL join (`profiles p JOIN businesses b ...`) is
   * `tasks.md` task 4.1, landing in PR 2. No route or UI in this PR calls
   * this on the Postgres backend, so this is unreachable at runtime here.
   */
  async listMembershipsForUser(): Promise<BusinessMembership[]> {
    throw new Error("listMembershipsForUser (Postgres) is not implemented yet — see tasks.md task 4.1 (PR 2).");
  },
};
