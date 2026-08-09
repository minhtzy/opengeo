import { sql } from 'drizzle-orm'
import {
  boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid,
} from 'drizzle-orm/pg-core'
import type { AccuracyFlag } from '@geosuite/shared'
import { brands, organizations } from './tenancy.js'
import { prompts } from './tracking.js'

export const probeRuns = pgTable(
  'probe_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    status: text('status').notNull().default('pending'),
    totalJobs: integer('total_jobs').notNull().default(0),
    succeededJobs: integer('succeeded_jobs').notNull().default(0),
    failedJobs: integer('failed_jobs').notNull().default(0),
    coverage: numeric('coverage', { precision: 5, scale: 4 }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({ byBrandDay: index('probe_runs_brand_day_idx').on(table.orgId, table.brandId, table.day) }),
)

export const probeResults = pgTable(
  'probe_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').notNull().references(() => probeRuns.id, { onDelete: 'cascade' }),
    promptId: uuid('prompt_id').notNull().references(() => prompts.id, { onDelete: 'cascade' }),
    engineId: text('engine_id').notNull(),
    model: text('model').notNull(),
    rawText: text('raw_text').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    cacheHit: boolean('cache_hit').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ byRun: index('probe_results_run_idx').on(table.orgId, table.runId), uniqueRunPromptEngine: unique('probe_results_run_prompt_engine_uq').on(table.orgId, table.runId, table.promptId, table.engineId) }),
)

export const citations = pgTable(
  'citations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    probeResultId: uuid('probe_result_id').notNull().references(() => probeResults.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    domain: text('domain').notNull(),
    title: text('title'),
    position: integer('position').notNull(),
    isOwnDomain: boolean('is_own_domain').notNull().default(false),
  },
  (table) => ({ byResult: index('citations_result_idx').on(table.orgId, table.probeResultId) }),
)

export const observations = pgTable(
  'observations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').notNull().references(() => probeRuns.id, { onDelete: 'cascade' }),
    promptId: uuid('prompt_id').notNull().references(() => prompts.id, { onDelete: 'cascade' }),
    engineId: text('engine_id').notNull(),
    mentioned: boolean('mentioned').notNull(),
    position: integer('position'),
    sentiment: numeric('sentiment', { precision: 3, scale: 2 }),
    citedOwnDomain: boolean('cited_own_domain').notNull(),
    competitorIds: text('competitor_ids').array().notNull().default(sql`'{}'::text[]`),
    accuracyFlags: jsonb('accuracy_flags').$type<AccuracyFlag[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ byRun: index('observations_run_idx').on(table.orgId, table.runId), uniqueRunPromptEngine: unique('observations_run_prompt_engine_uq').on(table.orgId, table.runId, table.promptId, table.engineId) }),
)

export const dailyMetrics = pgTable(
  'daily_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    visibilityRate: numeric('visibility_rate', { precision: 5, scale: 4 }).notNull(),
    shareOfVoice: numeric('share_of_voice', { precision: 5, scale: 4 }).notNull(),
    citationRate: numeric('citation_rate', { precision: 5, scale: 4 }).notNull(),
    averagePosition: numeric('average_position', { precision: 5, scale: 2 }),
    sentimentScore: numeric('sentiment_score', { precision: 3, scale: 2 }),
    accuracyFlagCount: integer('accuracy_flag_count').notNull(),
    coverage: numeric('coverage', { precision: 5, scale: 4 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ uniqueOrganizationBrandDay: unique('daily_metrics_org_brand_day_uq').on(table.orgId, table.brandId, table.day) }),
)
