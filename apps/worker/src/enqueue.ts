import type { EngineId } from '@geosuite/shared'
import type { ProbeJob } from '@geosuite/probe-engine'
export interface PromptInput { id: string; text: string; locale: string }
export interface BuildJobsInput { orgId: string; brandId: string; day: string; prompts: PromptInput[]; engineIds: EngineId[] }
export function buildProbeJobs(input: BuildJobsInput): Omit<ProbeJob, 'runId'>[] { return input.prompts.flatMap((p) => input.engineIds.map((engineId) => ({ orgId: input.orgId, brandId: input.brandId, promptId: p.id, promptText: p.text, engineId, locale: p.locale, day: input.day }))) }
