import { expect, it, vi } from 'vitest'
import type { BrandProfile, Engine, EngineResponse } from '@geosuite/shared'
import { BudgetExceededError } from './budget.js'
import { executeProbeJob, finalizeRun, type ProbeDeps, type ProbeJob } from './run.js'

const brand: BrandProfile = { brandId: 'brand-1', name: 'Viettel', aliases: [], domains: ['viettel.vn'], entityDescription: 'Nhà mạng', facts: [], competitors: [] }
const response: EngineResponse = { engineId: 'openai', model: 'gpt-4o', text: 'Viettel dẫn đầu.', citations: [{ url: 'https://viettel.vn/a', title: null, position: 1 }], latencyMs: 1, usage: { inputTokens: 1, outputTokens: 2, costUsd: 0.001 } }
const job: ProbeJob = { orgId: 'o', brandId: 'brand-1', runId: 'r', promptId: 'p', promptText: 'x', engineId: 'openai', locale: 'vi-VN', day: '2026-08-06' }

function deps(): { deps: ProbeDeps; run: ReturnType<typeof vi.fn>; mark: ReturnType<typeof vi.fn> } {
  const run = vi.fn(async () => response); const mark = vi.fn(async () => {})
  const engine: Engine = { id: 'openai', run }
  return { run, mark, deps: {
    engines: new Map([['openai', engine]]), cache: { get: vi.fn(async () => null), set: vi.fn(async () => {}) }, throttle: { acquire: vi.fn(async () => {}) }, budget: { check: vi.fn(async () => ({ allowed: true, spentUsd: 0, limitUsd: 10 })) }, confirmer: { confirm: vi.fn(async () => ({ brandMentioned: true, brandPosition: 1, sentiment: 0.5, competitorIds: [], accuracyFlags: [], usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } })) }, cacheTtlSeconds: 60,
    repos: { organizations: { getSettings: async () => ({ monthlyBudgetUsd: 10, sharedCacheEnabled: true }), listAll: async () => [] }, brands: { getProfile: async () => brand, listByOrg: async () => [] }, probeRuns: { markJob: mark, complete: vi.fn(async () => {}) }, probeResults: { insert: vi.fn(async () => 'x') }, observations: { insert: vi.fn(async () => {}), listByRun: vi.fn(async () => []) }, dailyMetrics: { upsert: vi.fn(async () => {}) }, usage: { record: vi.fn(async () => {}), spentThisMonth: async () => 0 } },
  } }
}
it('runs a job and marks it succeeded', async () => { const x = deps(); await executeProbeJob(job, x.deps); expect(x.run).toHaveBeenCalledOnce(); expect(x.mark).toHaveBeenCalledWith('o', 'r', 'succeeded') })
it('does not call engine when budget is exceeded', async () => { const x = deps(); x.deps.budget = { check: async () => ({ allowed: false, spentUsd: 10, limitUsd: 10 }) }; await expect(executeProbeJob(job, x.deps)).rejects.toBeInstanceOf(BudgetExceededError); expect(x.run).not.toHaveBeenCalled() })
it('finalizes coverage and metrics', async () => { const x = deps(); const summary = await finalizeRun({ orgId: 'o', brandId: 'brand-1', runId: 'r', day: '2026-08-06', totalJobs: 2, succeededJobs: 1 }, x.deps); expect(summary.coverage).toBe(0.5) })
