import { afterAll, beforeAll, expect, it } from 'vitest'
import pg from 'pg'
import { startPostgres, type PostgresHandle } from '../testing/postgres.js'

let handle: PostgresHandle
let pool: pg.Pool
let orgA: string
let orgB: string
async function asOrg<T>(orgId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try { await client.query('BEGIN'); await client.query('SELECT set_config($1, $2, true)', ['app.current_org', orgId]); const result = await fn(client); await client.query('COMMIT'); return result }
  catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}
beforeAll(async () => {
  handle = await startPostgres(); pool = new pg.Pool({ connectionString: handle.url })
  const a = await pool.query<{id:string}>("INSERT INTO organizations (name) VALUES ('A') RETURNING id")
  const b = await pool.query<{id:string}>("INSERT INTO organizations (name) VALUES ('B') RETURNING id")
  orgA = a.rows[0]!.id; orgB = b.rows[0]!.id
  await asOrg(orgA, c => c.query('INSERT INTO brands (org_id, name) VALUES ($1, $2)', [orgA, 'Brand A']))
  await asOrg(orgB, c => c.query('INSERT INTO brands (org_id, name) VALUES ($1, $2)', [orgB, 'Brand B']))
})
afterAll(async () => { await pool?.end(); await handle?.stop() })
it('runs as a role that cannot bypass row-level security', async () => {
  const { rows } = await pool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
  )
  expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false })
})
it('isolates tenant reads', async () => expect((await asOrg(orgA, c => c.query<{name:string}>('SELECT name FROM brands'))).rows.map(r => r.name)).toEqual(['Brand A']))
it('rejects cross-tenant writes', async () => await expect(asOrg(orgA, c => c.query('INSERT INTO brands (org_id, name) VALUES ($1, $2)', [orgB, 'no']))).rejects.toThrow(/row-level security/i))
it('returns no rows without an org context', async () => expect((await pool.query('SELECT * FROM brands')).rows).toEqual([]))
