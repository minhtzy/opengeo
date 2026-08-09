import type { BrandProfile, Citation, EngineResponse, Observation, TokenUsage } from '@geosuite/shared'
import { findCandidates } from './candidates.js'
import type { Confirmer } from './confirm.js'
export * from './candidates.js'
export * from './confirm.js'
export interface ExtractionResult { observation: Observation; usage: TokenUsage }
const zeroUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 }
export function citesOwnDomain(citations: Citation[], domains: string[]): boolean { return citations.some(({ url }) => { try { const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); return domains.some((domain) => { const normalized = domain.replace(/^www\./, '').toLowerCase(); return host === normalized || host.endsWith(`.${normalized}`) }) } catch { return false } }) }
export async function extract(response: EngineResponse, brand: BrandProfile, confirmer: Confirmer): Promise<ExtractionResult> { const citedOwnDomain = citesOwnDomain(response.citations, brand.domains); const candidates = findCandidates(response.text, brand); if (candidates.length === 0) return { observation: { mentioned: false, position: null, sentiment: null, citedOwnDomain, competitorIds: [], accuracyFlags: [] }, usage: zeroUsage }; const confirmed = await confirmer.confirm({ text: response.text, brand, candidates }); return { observation: { mentioned: confirmed.brandMentioned, position: confirmed.brandPosition, sentiment: confirmed.sentiment, citedOwnDomain, competitorIds: confirmed.competitorIds, accuracyFlags: confirmed.accuracyFlags }, usage: confirmed.usage } }
