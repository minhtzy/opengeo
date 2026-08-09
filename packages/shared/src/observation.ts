import type { EngineId } from './engine.js'
export interface AccuracyFlag { factId: string; statedIncorrectly: string }
export interface Observation { mentioned: boolean; position: number | null; sentiment: number | null; citedOwnDomain: boolean; competitorIds: string[]; accuracyFlags: AccuracyFlag[] }
export interface ObservationRow extends Observation { promptId: string; engineId: EngineId }
