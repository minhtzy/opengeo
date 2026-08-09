import { z } from 'zod'

export const engineIds = ['openai', 'perplexity', 'gemini', 'ai_overviews'] as const
export type EngineId = (typeof engineIds)[number]
export const citationSchema = z.object({ url: z.string().url(), title: z.string().nullable(), position: z.number().int().min(1) })
export type Citation = z.infer<typeof citationSchema>
export const tokenUsageSchema = z.object({ inputTokens: z.number().int().min(0), outputTokens: z.number().int().min(0), costUsd: z.number().min(0) })
export type TokenUsage = z.infer<typeof tokenUsageSchema>
export const engineResponseSchema = z.object({ engineId: z.enum(engineIds), model: z.string().min(1), text: z.string(), citations: z.array(citationSchema), latencyMs: z.number().int().min(0), usage: tokenUsageSchema })
export type EngineResponse = z.infer<typeof engineResponseSchema>
export interface EngineQuery { prompt: string; locale: string }
export interface Engine { readonly id: EngineId; run(query: EngineQuery): Promise<EngineResponse> }
