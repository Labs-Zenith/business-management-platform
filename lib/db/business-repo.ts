import type { Business, BusinessRepository } from "@/lib/services/ports";
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
};
