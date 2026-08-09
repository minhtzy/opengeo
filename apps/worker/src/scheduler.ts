import type { FlowProducer } from 'bullmq'
import type { AppDeps } from './deps.js'
import { buildProbeJobs } from './enqueue.js'
import { FINALIZE_QUEUE, PROBE_ATTEMPTS, PROBE_QUEUE } from './queues.js'
export interface EnqueueInput { orgId: string; brandId: string; day: string }
export async function enqueueRun(input: EnqueueInput, deps: AppDeps, flow: FlowProducer): Promise<string | null> {
  const [prompts, engineIds] = await Promise.all([deps.prompts.listActive(input.orgId, input.brandId), deps.engineConfigs.listEnabled(input.orgId, input.brandId)])
  const jobs = buildProbeJobs({ ...input, prompts, engineIds }); if (!jobs.length) return null
  const runId = await deps.probe.repos.probeRuns.create(input.orgId, { brandId: input.brandId, day: input.day, totalJobs: jobs.length })
  await flow.add({ name: 'finalize', queueName: FINALIZE_QUEUE, data: { ...input, runId, totalJobs: jobs.length }, children: jobs.map((job) => ({ name: `${job.promptId}:${job.engineId}`, queueName: PROBE_QUEUE, data: { ...job, runId }, opts: { attempts: PROBE_ATTEMPTS, backoff: { type: 'exponential', delay: 5_000 }, ignoreDependencyOnFailure: true } })) })
  return runId
}
export async function enqueueAllBrands(deps: AppDeps, flow: FlowProducer, day: string): Promise<number> { let total = 0; for (const org of await deps.probe.repos.organizations.listAll()) for (const brand of await deps.probe.repos.brands.listByOrg(org.id)) if (await enqueueRun({ orgId: org.id, brandId: brand.id, day }, deps, flow)) total++; return total }
