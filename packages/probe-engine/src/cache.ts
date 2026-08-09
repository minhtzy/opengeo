import { createHash } from 'node:crypto'
import type { Redis } from 'ioredis'
import { engineResponseSchema, type EngineId, type EngineResponse } from '@geosuite/shared'
export interface CacheKeyInput { prompt: string; engineId: EngineId; model: string; locale: string; day: string }
export function responseCacheKey(input: CacheKeyInput): string {
  const material = [input.prompt.trim(), input.engineId, input.model, input.locale, input.day].join('\0')
  return `resp:${createHash('sha256').update(material, 'utf8').digest('hex')}`
}
export interface ResponseCache { get(key: string): Promise<EngineResponse | null>; set(key: string, value: EngineResponse, ttlSeconds: number): Promise<void> }
export function createRedisResponseCache(redis: Redis): ResponseCache { return { async get(key) {
  const raw = await redis.get(key); if (raw === null) return null
  let parsed: unknown; try { parsed = JSON.parse(raw) } catch { return null }
  const result = engineResponseSchema.safeParse(parsed); return result.success ? result.data : null
}, async set(key, value, ttlSeconds) { await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds) } } }
