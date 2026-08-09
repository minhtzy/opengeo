import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis'
export interface RedisHandle { url: string; stop(): Promise<void> }
export async function startRedis(): Promise<RedisHandle> {
  const container: StartedRedisContainer = await new RedisContainer('redis:7-alpine').start()
  return { url: container.getConnectionUrl(), async stop() { await container.stop() } }
}
