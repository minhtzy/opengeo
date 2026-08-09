import type { Engine, EngineId, EngineResponse } from '@geosuite/shared'
import type { BrandRepository, DailyMetricRepository, ObservationRepository, OrganizationRepository, ProbeResultRepository, ProbeRunRepository, UsageRepository } from '@geosuite/db'
import { extract, type Confirmer } from '@geosuite/extraction'
import { computeMetrics, type MetricSet } from '@geosuite/scoring'
import { BudgetExceededError, type BudgetGuard } from './budget.js'
import { responseCacheKey, type ResponseCache } from './cache.js'
import type { Throttle } from './throttle.js'

export interface ProbeRepos { organizations: OrganizationRepository; brands: BrandRepository; probeRuns: ProbeRunRepository; probeResults: ProbeResultRepository; observations: ObservationRepository; dailyMetrics: DailyMetricRepository; usage: UsageRepository }
export interface ProbeDeps { engines: Map<EngineId, Engine>; cache: ResponseCache; throttle: Throttle; budget: BudgetGuard; confirmer: Confirmer; repos: ProbeRepos; cacheTtlSeconds: number }
export interface ProbeJob { orgId: string; brandId: string; runId: string; promptId: string; promptText: string; engineId: EngineId; locale: string; day: string }

export async function executeProbeJob(job: ProbeJob, deps: ProbeDeps): Promise<void> {
  const status = await deps.budget.check(job.orgId)
  if (!status.allowed) throw new BudgetExceededError(job.orgId, status.spentUsd, status.limitUsd)
  const engine = deps.engines.get(job.engineId); if (!engine) throw new Error(`Engine "${job.engineId}" chưa được đăng ký`)
  const settings = await deps.repos.organizations.getSettings(job.orgId)
  const key = responseCacheKey({ prompt: job.promptText, engineId: job.engineId, model: engine.id, locale: job.locale, day: job.day })
  let response: EngineResponse | null = settings.sharedCacheEnabled ? await deps.cache.get(key) : null
  const cacheHit = response !== null
  if (!response) {
    await deps.throttle.acquire(job.engineId)
    response = await engine.run({ prompt: job.promptText, locale: job.locale })
    if (settings.sharedCacheEnabled) await deps.cache.set(key, response, deps.cacheTtlSeconds)
    await deps.repos.usage.record(job.orgId, { runId: job.runId, engineId: job.engineId, purpose: 'probe', inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens, costUsd: response.usage.costUsd })
  }
  const brand = await deps.repos.brands.getProfile(job.orgId, job.brandId)
  await deps.repos.probeResults.insert(job.orgId, { runId: job.runId, promptId: job.promptId, engineId: job.engineId, model: response.model, rawText: response.text, latencyMs: response.latencyMs, cacheHit, citations: response.citations, ownDomains: brand.domains })
  const result = await extract(response, brand, deps.confirmer)
  if (result.usage.costUsd > 0) await deps.repos.usage.record(job.orgId, { runId: job.runId, engineId: job.engineId, purpose: 'extraction', inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costUsd: result.usage.costUsd })
  await deps.repos.observations.insert(job.orgId, { runId: job.runId, promptId: job.promptId, engineId: job.engineId, ...result.observation })
  await deps.repos.probeRuns.markJob(job.orgId, job.runId, 'succeeded')
}

export interface FinalizeInput { orgId: string; brandId: string; runId: string; day: string; totalJobs: number; succeededJobs: number }
export interface RunSummary { coverage: number; metrics: MetricSet }
export async function finalizeRun(input: FinalizeInput, deps: ProbeDeps): Promise<RunSummary> {
  const coverage = input.totalJobs === 0 ? 0 : input.succeededJobs / input.totalJobs
  const metrics = computeMetrics(await deps.repos.observations.listByRun(input.orgId, input.runId))
  await deps.repos.dailyMetrics.upsert(input.orgId, { brandId: input.brandId, day: input.day, ...metrics, coverage })
  await deps.repos.probeRuns.complete(input.orgId, input.runId, coverage)
  return { coverage, metrics }
}
