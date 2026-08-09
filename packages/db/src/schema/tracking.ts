import { sql } from 'drizzle-orm'
import { boolean, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { brands, organizations } from './tenancy.js'

export const brandProfiles = pgTable(
  'brand_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
    aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
    domains: text('domains').array().notNull().default(sql`'{}'::text[]`),
    entityDescription: text('entity_description').notNull().default(''),
  },
  (table) => ({ uniqueBrand: unique('brand_profiles_brand_uq').on(table.brandId) }),
)

export const brandFacts = pgTable('brand_facts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  claim: text('claim').notNull(),
})

export const competitors = pgTable('competitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
})

export const prompts = pgTable(
  'prompts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    topic: text('topic').notNull().default(''),
    funnelStage: text('funnel_stage').notNull().default('awareness'),
    locale: text('locale').notNull().default('vi-VN'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ byBrand: index('prompts_brand_idx').on(table.orgId, table.brandId, table.active) }),
)

export const engineConfigs = pgTable(
  'engine_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
    engineId: text('engine_id').notNull(),
    enabled: boolean('enabled').notNull().default(true),
  },
  (table) => ({ uniqueBrandEngine: unique('engine_configs_brand_engine_uq').on(table.brandId, table.engineId) }),
)
