import { expect, it } from 'vitest'
import type { EngineResponse } from '@geosuite/shared'
import { createRedisResponseCache, responseCacheKey } from './cache.js'

const input = { prompt: 'question', engineId: 'openai', model: 'gpt-4o', locale: 'vi-VN', day: '2026-08-06' } as const
const response: EngineResponse = { engineId: 'openai', model: 'gpt-4o', text: 'answer', citations: [], latencyMs: 0, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }
it('creates a stable tenant-independent SHA-256 key', () => { expect(responseCacheKey(input)).toMatch(/^resp:[0-9a-f]{64}$/); expect(responseCacheKey(input)).toBe(responseCacheKey({ ...input })); expect(responseCacheKey({ ...input, day: '2026-08-07' })).not.toBe(responseCacheKey(input)) })
it('returns cache miss for malformed cached JSON', async () => { const cache = createRedisResponseCache({ get: async () => '{', set: async () => 'OK' } as never); expect(await cache.get('x')).toBeNull() })
it('validates responses when reading cache', async () => { const cache = createRedisResponseCache({ get: async () => JSON.stringify(response), set: async () => 'OK' } as never); expect(await cache.get('x')).toEqual(response) })
