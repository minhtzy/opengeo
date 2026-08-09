import type { OrganizationRepository, UsageRepository } from '@geosuite/db'
export interface BudgetStatus { allowed: boolean; spentUsd: number; limitUsd: number }
export interface BudgetGuard { check(orgId: string): Promise<BudgetStatus> }
export class BudgetExceededError extends Error {
  constructor(readonly orgId: string, readonly spentUsd: number, readonly limitUsd: number) {
    super(`Org ${orgId} đã dùng ${spentUsd.toFixed(2)} USD, vượt hạn mức ${limitUsd.toFixed(2)} USD`); this.name = 'BudgetExceededError'
  }
}
export interface BudgetGuardDeps { organizations: OrganizationRepository; usage: UsageRepository }
export function createBudgetGuard(deps: BudgetGuardDeps): BudgetGuard { return { async check(orgId) {
  const [settings, spentUsd] = await Promise.all([deps.organizations.getSettings(orgId), deps.usage.spentThisMonth(orgId)])
  const limitUsd = settings.monthlyBudgetUsd; return { allowed: spentUsd < limitUsd, spentUsd, limitUsd }
} } }
