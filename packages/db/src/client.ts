import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema/index.js'

export type Tx = NodePgDatabase<typeof schema>

export function createPool(url: string): pg.Pool {
  return new pg.Pool({ connectionString: url })
}

export async function withOrg<T>(pool: pg.Pool, orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT set_config($1, $2, true)', ['app.current_org', orgId])
    const result = await fn(drizzle(client, { schema }))
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
