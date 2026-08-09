import { and, eq, gte, sql } from 'drizzle-orm'
import type pg from 'pg'
import type { EngineId } from '@geosuite/shared'
import { withOrg } from '../client.js'
import { usageRecords } from '../schema/index.js'
export interface UsageInput {runId?:string;engineId:EngineId;purpose:'probe'|'extraction';inputTokens:number;outputTokens:number;costUsd:number}
export interface UsageRepository {record(orgId:string,input:UsageInput):Promise<void>;spentThisMonth(orgId:string):Promise<number>}
export function createUsageRepository(pool:pg.Pool):UsageRepository{return {async record(orgId,input){await withOrg(pool,orgId,tx=>tx.insert(usageRecords).values({orgId,runId:input.runId??null,engineId:input.engineId,purpose:input.purpose,inputTokens:input.inputTokens,outputTokens:input.outputTokens,costUsd:input.costUsd.toFixed(6)}).then(()=>undefined))},async spentThisMonth(orgId){return withOrg(pool,orgId,async tx=>{const [r]=await tx.select({total:sql<string>`coalesce(sum(${usageRecords.costUsd}),0)`}).from(usageRecords).where(and(eq(usageRecords.orgId,orgId),gte(usageRecords.createdAt,sql`date_trunc('month', now())`)));return Number(r?.total??0)})}}}
