import type { EngineId } from '@geosuite/shared'
export class EngineError extends Error { constructor(readonly engineId: EngineId, readonly status: number, readonly body: string) { super(`${engineId} returned ${status}`); this.name = 'EngineError' } get retryable(): boolean { return this.status === 408 || this.status === 429 || this.status >= 500 } }
