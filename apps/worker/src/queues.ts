import { FlowProducer, Queue, Worker, type ConnectionOptions } from 'bullmq'
import type { ProbeJob } from '@geosuite/probe-engine'
export const PROBE_QUEUE = 'probe'; export const FINALIZE_QUEUE = 'finalize'; export const SCHEDULE_QUEUE = 'schedule'; export const PROBE_ATTEMPTS = 3
export interface FinalizeJobData { orgId: string; brandId: string; runId: string; day: string; totalJobs: number }
export function createProbeQueue(connection: ConnectionOptions): Queue<ProbeJob> { return new Queue(PROBE_QUEUE, { connection }) }
export function createFlowProducer(connection: ConnectionOptions): FlowProducer { return new FlowProducer({ connection }) }
export { Worker }
