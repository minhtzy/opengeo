import { fileURLToPath } from 'node:url'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

export interface PostgresHandle {
  url: string
  stop(): Promise<void>
}

const migrationsFolder = fileURLToPath(new URL('../../migrations', import.meta.url))

export async function startPostgres(): Promise<PostgresHandle> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16-alpine').start()
  const url = container.getConnectionUri()
  const pool = new pg.Pool({ connectionString: url })
  await migrate(drizzle(pool), { migrationsFolder })
  await pool.end()

  return {
    url,
    async stop() {
      await container.stop()
    },
  }
}
