import { Queue, Worker } from 'bullmq'
import { executeProbeJob, finalizeRun, type ProbeJob } from '@geosuite/probe-engine'
import { loadConfig } from './config.js'
import { createDeps } from './deps.js'
import { createFlowProducer, FINALIZE_QUEUE, PROBE_ATTEMPTS, PROBE_QUEUE, SCHEDULE_QUEUE, type FinalizeJobData } from './queues.js'
import { enqueueAllBrands } from './scheduler.js'
const config = loadConfig(process.env); const deps = createDeps(config); const connection = { url: config.redisUrl }
const probeWorker = new Worker<ProbeJob>(PROBE_QUEUE, async (job) => { try { await executeProbeJob(job.data, deps.probe) } catch (error) { if (job.attemptsMade + 1 >= PROBE_ATTEMPTS) await deps.probe.repos.probeRuns.markJob(job.data.orgId, job.data.runId, 'failed'); throw error } }, { connection, concurrency: 8 })
const finalizeWorker = new Worker<FinalizeJobData>(FINALIZE_QUEUE, async (job) => { const { orgId, brandId, runId, day, totalJobs } = job.data; const succeededJobs = Object.keys(await job.getChildrenValues()).length; const summary = await finalizeRun({ orgId, brandId, runId, day, totalJobs, succeededJobs }, deps.probe); console.log(`Run ${runId}: độ phủ ${(summary.coverage * 100).toFixed(1)}%`) }, { connection })
const flow = createFlowProducer(connection); const scheduleQueue = new Queue(SCHEDULE_QUEUE, { connection })
await scheduleQueue.upsertJobScheduler('daily-probe', { pattern: '0 3 * * *' }, { name: 'daily-probe' })
const scheduleWorker = new Worker(SCHEDULE_QUEUE, async () => { const day = new Date().toISOString().slice(0, 10); const count = await enqueueAllBrands(deps, flow, day); console.log(`Đã xếp hàng ${count} lần chạy cho ngày ${day}.`) }, { connection })
async function shutdown(): Promise<void> { await Promise.all([probeWorker.close(), finalizeWorker.close(), scheduleWorker.close(), flow.close(), scheduleQueue.close()]); await deps.close(); process.exit(0) }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown); console.log('Worker đã khởi động, đang chờ job.')
