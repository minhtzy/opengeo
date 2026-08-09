import { expect, it, vi } from 'vitest'
import type { BrandProfile, EngineResponse } from '@geosuite/shared'
import { citesOwnDomain, extract } from './index.js'
import type { Confirmer } from './confirm.js'
const brand: BrandProfile = { brandId: 'b1', name: 'Viettel', aliases: [], domains: ['viettel.vn'], entityDescription: 'Telecom', facts: [], competitors: [] }
const response: EngineResponse = { engineId: 'openai', model: 'test', text: 'Viettel is good.', citations: [{ url: 'https://shop.viettel.vn/a', title: null, position: 1 }], latencyMs: 1, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }
it('recognizes a brand domain without accepting lookalikes', () => { expect(citesOwnDomain(response.citations, brand.domains)).toBe(true); expect(citesOwnDomain([{ url: 'https://viettel.vn.evil.com', title: null, position: 1 }], brand.domains)).toBe(false) })
it('skips confirmation without candidates', async () => { const confirm = vi.fn(); const result = await extract({ ...response, text: 'none' }, brand, { confirm }); expect(confirm).not.toHaveBeenCalled(); expect(result.observation.mentioned).toBe(false) })
