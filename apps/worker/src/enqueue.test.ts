import { expect, it } from 'vitest'
import { buildProbeJobs } from './enqueue.js'
it('sinh job theo tích Descartes prompt-engine', () => { const jobs = buildProbeJobs({ orgId: 'o', brandId: 'b', day: '2026-01-01', prompts: [{ id: 'p1', text: 'a', locale: 'vi-VN' }, { id: 'p2', text: 'b', locale: 'en-US' }], engineIds: ['openai', 'gemini'] }); expect(jobs).toHaveLength(4); expect(jobs[0]).toMatchObject({ promptId: 'p1', engineId: 'openai', promptText: 'a' }) })
it('trả rỗng nếu thiếu prompt hoặc engine', () => { expect(buildProbeJobs({ orgId: 'o', brandId: 'b', day: 'd', prompts: [], engineIds: ['openai'] })).toEqual([]); expect(buildProbeJobs({ orgId: 'o', brandId: 'b', day: 'd', prompts: [{ id: 'p', text: 'a', locale: 'vi' }], engineIds: [] })).toEqual([]) })
