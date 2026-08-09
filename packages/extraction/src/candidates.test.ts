import { expect, it } from 'vitest'
import type { BrandProfile } from '@geosuite/shared'
import { findCandidates } from './candidates.js'
const brand: BrandProfile = { brandId: 'b1', name: 'Viettel', aliases: ['Viettel Telecom'], domains: ['viettel.vn'], entityDescription: 'Telecom', facts: [], competitors: [{ id: 'c1', name: 'VinaPhone', aliases: ['Vinaphone'] }, { id: 'c2', name: 'MobiFone', aliases: [] }] }
it('finds entities by earliest occurrence', () => expect(findCandidates('MobiFone và Viettel đều tốt, VinaPhone rẻ hơn.', brand).map((item) => item.entityId)).toEqual(['c2', 'b1', 'c1']))
it('does not match a word contained within a larger word', () => expect(findCandidates('Vietteller is not Viettel', { ...brand, competitors: [] })).toHaveLength(1))
