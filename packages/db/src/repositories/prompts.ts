import { and, eq } from 'drizzle-orm'
import type pg from 'pg'
import type { EngineId } from '@geosuite/shared'
import { withOrg } from '../client.js'
import { engineConfigs, prompts } from '../schema/index.js'
export interface PromptRow { id:string; text:string; locale:string }
export interface PromptRepository { listActive(orgId:string, brandId:string): Promise<PromptRow[]> }
export function createPromptRepository(pool:pg.Pool):PromptRepository { return { async listActive(orgId,brandId){ return withOrg(pool,orgId,tx=>tx.select({id:prompts.id,text:prompts.text,locale:prompts.locale}).from(prompts).where(and(eq(prompts.brandId,brandId),eq(prompts.active,true)))) } } }
export interface EngineConfigRepository { listEnabled(orgId:string,brandId:string):Promise<EngineId[]> }
export function createEngineConfigRepository(pool:pg.Pool):EngineConfigRepository { return { async listEnabled(orgId,brandId){ return withOrg(pool,orgId,async tx=>(await tx.select({engineId:engineConfigs.engineId}).from(engineConfigs).where(and(eq(engineConfigs.brandId,brandId),eq(engineConfigs.enabled,true)))).map(r=>r.engineId as EngineId)) } } }
