import Redis from 'ioredis'
import { createBrandRepository, createDailyMetricRepository, createEngineConfigRepository, createObservationRepository, createOrganizationRepository, createPool, createProbeResultRepository, createProbeRunRepository, createPromptRepository, createUsageRepository } from '@geosuite/db'
import { createAiOverviewsEngine, createGeminiEngine, createOpenAiEngine, createPerplexityEngine } from '@geosuite/engines'
import { createLlmConfirmer } from '@geosuite/extraction'
import { createBudgetGuard, createRedisResponseCache, createRedisThrottle, type ProbeDeps } from '@geosuite/probe-engine'
import type { AppConfig } from './config.js'

export interface AppDeps { probe: ProbeDeps; redis: Redis; prompts: ReturnType<typeof createPromptRepository>; engineConfigs: ReturnType<typeof createEngineConfigRepository>; close(): Promise<void> }
export function createDeps(config: AppConfig): AppDeps {
  const pool = createPool(config.databaseUrl); const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null })
  const organizations = createOrganizationRepository(pool); const usage = createUsageRepository(pool)
  return { redis, prompts: createPromptRepository(pool), engineConfigs: createEngineConfigRepository(pool), probe: {
    engines: new Map([['openai', createOpenAiEngine(config.openai)], ['perplexity', createPerplexityEngine(config.perplexity)], ['gemini', createGeminiEngine(config.gemini)], ['ai_overviews', createAiOverviewsEngine(config.serp)]]),
    cache: createRedisResponseCache(redis), throttle: createRedisThrottle(redis, config.rateLimits), budget: createBudgetGuard({ organizations, usage }), confirmer: createLlmConfirmer(config.extraction), cacheTtlSeconds: config.cacheTtlSeconds,
    repos: { organizations, brands: createBrandRepository(pool), probeRuns: createProbeRunRepository(pool), probeResults: createProbeResultRepository(pool), observations: createObservationRepository(pool), dailyMetrics: createDailyMetricRepository(pool), usage },
  }, async close() { await redis.quit(); await pool.end() } }
}
