import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import type pg from 'pg'
import { organizations } from '../schema/index.js'

export interface OrgSettings { monthlyBudgetUsd: number; sharedCacheEnabled: boolean }
export interface OrganizationRepository {
  getSettings(orgId: string): Promise<OrgSettings>
  listAll(): Promise<{ id: string }[]>
}
export function createOrganizationRepository(pool: pg.Pool): OrganizationRepository {
  const db = drizzle(pool)
  return {
    async listAll() { return db.select({ id: organizations.id }).from(organizations) },
    async getSettings(orgId) {
      const [row] = await db.select().from(organizations).where(eq(organizations.id, orgId))
      if (!row) throw new Error(`Không tìm thấy organization ${orgId}`)
      return { monthlyBudgetUsd: Number(row.monthlyBudgetUsd), sharedCacheEnabled: row.sharedCacheEnabled }
    },
  }
}
