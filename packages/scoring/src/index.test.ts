import { expect, it } from 'vitest'
import type { ObservationRow } from '@geosuite/shared'
import { computeMetrics } from './index.js'
const row = (overrides: Partial<ObservationRow> = {}): ObservationRow => ({ promptId: 'p', engineId: 'openai', mentioned: false, position: null, sentiment: null, citedOwnDomain: false, competitorIds: [], accuracyFlags: [], ...overrides })
it('returns neutral metrics for empty observations', () => expect(computeMetrics([])).toEqual({ visibilityRate: 0, shareOfVoice: 0, citationRate: 0, averagePosition: null, sentimentScore: null, accuracyFlagCount: 0 }))
it('computes all rates', () => { const metrics = computeMetrics([row({ mentioned: true, citedOwnDomain: true, position: 1, sentiment: 0.5, competitorIds: ['c'] }), row()]); expect(metrics).toMatchObject({ visibilityRate: 0.5, shareOfVoice: 0.5, citationRate: 0.5, averagePosition: 1, sentimentScore: 0.5 }) })
