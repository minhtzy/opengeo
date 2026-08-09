import { afterAll, beforeAll, expect, it } from 'vitest'
import pg from 'pg'
import { startPostgres, type PostgresHandle } from '../testing/postgres.js'

let handle: PostgresHandle
let pool: pg.Pool

beforeAll(async () => {
  handle = await startPostgres()
  pool = new pg.Pool({ connectionString: handle.url })
})

afterAll(async () => {
  await pool?.end()
  await handle?.stop()
})

it('creates all 15 business tables', async () => {
  const { rows } = await pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
  )
  const names = new Set(rows.map((row) => row.table_name))

  for (const table of [
    'organizations', 'users', 'memberships', 'brands',
    'brand_profiles', 'brand_facts', 'competitors', 'prompts', 'engine_configs',
    'probe_runs', 'probe_results', 'citations', 'observations', 'daily_metrics',
    'usage_records',
  ]) {
    expect(names, `missing table ${table}`).toContain(table)
  }
})

it('adds org_id to every tenant-owned business table', async () => {
  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT t.table_name FROM information_schema.tables t
     WHERE t.table_schema = 'public'
       AND t.table_name NOT IN ('organizations', 'users', '__drizzle_migrations')
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.columns c
         WHERE c.table_schema = 'public'
           AND c.table_name = t.table_name
           AND c.column_name = 'org_id'
       )`,
  )

  expect(rows.map((row) => row.table_name)).toEqual([])
})
