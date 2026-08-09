export interface EngineCostConfig { apiKey: string; model: string; inputCostPerMTok: number; outputCostPerMTok: number }
export interface AppConfig { databaseUrl: string; redisUrl: string; cacheTtlSeconds: number; openai: EngineCostConfig; perplexity: EngineCostConfig; gemini: EngineCostConfig; serp: { apiKey: string; costPerSearchUsd: number }; extraction: EngineCostConfig; rateLimits: Record<string, { capacity: number; refillPerSecond: number }> }
function required(env: NodeJS.ProcessEnv, key: string): string { const v = env[key]; if (!v) throw new Error(`Thiếu biến môi trường ${key}`); return v }
function num(env: NodeJS.ProcessEnv, key: string, fallback: number): number { const v = env[key]; if (!v) return fallback; const n = Number(v); if (!Number.isFinite(n) || n < 0) throw new Error(`Biến môi trường ${key} không phải số hợp lệ`); return n }
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const openai = { apiKey: required(env, 'OPENAI_API_KEY'), model: env.OPENAI_MODEL ?? 'gpt-4o', inputCostPerMTok: num(env, 'OPENAI_INPUT_COST', 2.5), outputCostPerMTok: num(env, 'OPENAI_OUTPUT_COST', 10) }
  return {
    databaseUrl: required(env, 'DATABASE_URL'), redisUrl: required(env, 'REDIS_URL'), cacheTtlSeconds: num(env, 'CACHE_TTL_SECONDS', 86400), openai,
    perplexity: { apiKey: required(env, 'PERPLEXITY_API_KEY'), model: env.PERPLEXITY_MODEL ?? 'sonar-pro', inputCostPerMTok: num(env, 'PERPLEXITY_INPUT_COST', 3), outputCostPerMTok: num(env, 'PERPLEXITY_OUTPUT_COST', 15) },
    gemini: { apiKey: required(env, 'GEMINI_API_KEY'), model: env.GEMINI_MODEL ?? 'gemini-2.5-flash', inputCostPerMTok: num(env, 'GEMINI_INPUT_COST', .3), outputCostPerMTok: num(env, 'GEMINI_OUTPUT_COST', 2.5) },
    serp: { apiKey: required(env, 'SERPAPI_API_KEY'), costPerSearchUsd: num(env, 'SERPAPI_COST_PER_SEARCH', .015) },
    extraction: { apiKey: openai.apiKey, model: env.EXTRACTION_MODEL ?? 'gpt-4o-mini', inputCostPerMTok: num(env, 'EXTRACTION_INPUT_COST', .15), outputCostPerMTok: num(env, 'EXTRACTION_OUTPUT_COST', .6) },
    rateLimits: { openai: { capacity: num(env, 'RATE_OPENAI_CAPACITY', 20), refillPerSecond: num(env, 'RATE_OPENAI_REFILL', 5) }, perplexity: { capacity: num(env, 'RATE_PERPLEXITY_CAPACITY', 10), refillPerSecond: num(env, 'RATE_PERPLEXITY_REFILL', 2) }, gemini: { capacity: num(env, 'RATE_GEMINI_CAPACITY', 20), refillPerSecond: num(env, 'RATE_GEMINI_REFILL', 5) }, ai_overviews: { capacity: num(env, 'RATE_SERP_CAPACITY', 10), refillPerSecond: num(env, 'RATE_SERP_REFILL', 2) } },
  }
}
