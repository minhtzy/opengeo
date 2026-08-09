import { expect, it } from 'vitest'
import { BudgetExceededError, createBudgetGuard } from './budget.js'

function guard(spent: number, limit: number) {
  return createBudgetGuard({
    organizations: { getSettings: async () => ({ monthlyBudgetUsd: limit, sharedCacheEnabled: true }), listAll: async () => [] },
    usage: { record: async () => {}, spentThisMonth: async () => spent },
  })
}
it('allows spending below the monthly limit', async () => expect(await guard(40, 100).check('o')).toEqual({ allowed: true, spentUsd: 40, limitUsd: 100 }))
it('blocks spending equal to the monthly limit', async () => expect((await guard(100, 100).check('o')).allowed).toBe(false))
it('retains budget details in BudgetExceededError', () => { const error = new BudgetExceededError('o', 120, 100); expect(error).toMatchObject({ orgId: 'o', spentUsd: 120, limitUsd: 100 }) })
