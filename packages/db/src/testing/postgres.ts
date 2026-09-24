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
  const adminUrl = container.getConnectionUri()
  const adminPool = new pg.Pool({ connectionString: adminUrl })
  await migrate(drizzle(adminPool), { migrationsFolder })
  await adminPool.query("CREATE ROLE geosuite_test LOGIN PASSWORD 'geosuite_test' NOSUPERUSER NOBYPASSRLS")
  await adminPool.query('GRANT USAGE ON SCHEMA public TO geosuite_test')
  await adminPool.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO geosuite_test')
  await adminPool.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO geosuite_test')
  await adminPool.end()

  const testUrl = new URL(adminUrl)
  testUrl.username = 'geosuite_test'
  testUrl.password = 'geosuite_test'

  return {
    url: testUrl.toString(),
    async stop() {
      await container.stop()
    },
  }
}
