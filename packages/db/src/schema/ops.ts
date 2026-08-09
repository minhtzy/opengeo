import { index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { probeRuns } from './measurement.js'
import { organizations } from './tenancy.js'

export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').references(() => probeRuns.id, { onDelete: 'set null' }),
    engineId: text('engine_id').notNull(),
    purpose: text('purpose').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ byOrganizationTime: index('usage_records_org_time_idx').on(table.orgId, table.createdAt) }),
)
