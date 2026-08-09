import { eq } from 'drizzle-orm'
import type pg from 'pg'
import type { BrandProfile } from '@geosuite/shared'
import { withOrg } from '../client.js'
import { brandFacts, brandProfiles, brands, competitors } from '../schema/index.js'
export interface BrandRepository { getProfile(orgId: string, brandId: string): Promise<BrandProfile>; listByOrg(orgId: string): Promise<{id:string;name:string}[]> }
export function createBrandRepository(pool: pg.Pool): BrandRepository { return {
  async listByOrg(orgId) { return withOrg(pool, orgId, (tx) => tx.select({id: brands.id, name: brands.name}).from(brands)) },
  async getProfile(orgId, brandId) { return withOrg(pool, orgId, async (tx) => {
    const [brand] = await tx.select().from(brands).where(eq(brands.id, brandId)); if (!brand) throw new Error(`Không tìm thấy brand ${brandId}`)
    const [profile] = await tx.select().from(brandProfiles).where(eq(brandProfiles.brandId, brandId)); const facts = await tx.select().from(brandFacts).where(eq(brandFacts.brandId, brandId)); const rivals = await tx.select().from(competitors).where(eq(competitors.brandId, brandId))
    return { brandId, name: brand.name, aliases: profile?.aliases ?? [], domains: profile?.domains ?? [], entityDescription: profile?.entityDescription ?? '', facts: facts.map(f=>({id:f.id,claim:f.claim})), competitors: rivals.map(c=>({id:c.id,name:c.name,aliases:c.aliases})) }
  }) },
} }
