import { executeProbeJob, finalizeRun, type RunSummary } from '@geosuite/probe-engine'
import type { AppDeps } from './deps.js'
import { buildProbeJobs } from './enqueue.js'
export interface RunOnceInput { orgId: string; brandId: string; day: string }
export async function runOnce(input: RunOnceInput, deps: AppDeps): Promise<RunSummary> {
  const [prompts, engineIds] = await Promise.all([deps.prompts.listActive(input.orgId, input.brandId), deps.engineConfigs.listEnabled(input.orgId, input.brandId)])
  const jobs = buildProbeJobs({ ...input, prompts, engineIds }); const runId = await deps.probe.repos.probeRuns.create(input.orgId, { brandId: input.brandId, day: input.day, totalJobs: jobs.length })
  let succeededJobs = 0
  for (const job of jobs) { try { await executeProbeJob({ ...job, runId }, deps.probe); succeededJobs++ } catch (error) { console.error(`Job ${job.promptId}/${job.engineId} thất bại:`, error); await deps.probe.repos.probeRuns.markJob(input.orgId, runId, 'failed') } }
  return finalizeRun({ ...input, runId, totalJobs: jobs.length, succeededJobs }, deps.probe)
}
