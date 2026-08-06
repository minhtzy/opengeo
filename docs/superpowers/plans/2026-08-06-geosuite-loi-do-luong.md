# GeoSuite — Lõi đo lường: Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng lõi đo lường của GeoSuite — chạy được một lần probe hoàn chỉnh qua 4 AI engine, bóc tách tín hiệu thương hiệu, tính 6 chỉ số và ghi vào `daily_metrics`, điều khiển bằng CLI, không cần giao diện web.

**Architecture:** Monorepo pnpm với các package thuần logic (`extraction`, `scoring`) tách khỏi package hạ tầng (`db`, `engines`). `engines` chỉ biết gửi prompt và trả câu trả lời thô, không biết gì về thương hiệu hay tenant. `probe-engine` điều phối và áp rate-limit, ngân sách, cache. `apps/worker` chạy hàng đợi BullMQ và CLI.

**Tech Stack:** TypeScript 5.6 (ESM, NodeNext), Node 22, pnpm 9, PostgreSQL 16 + Drizzle ORM, Redis 7 + BullMQ, Vitest, msw, Testcontainers, zod.

**Spec:** `docs/superpowers/specs/2026-08-05-geosuite-geo-tool-design.md`

## Global Constraints

- Node.js >= 22, pnpm >= 9. Mọi package đặt `"type": "module"`.
- TypeScript strict, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`. Import nội bộ luôn có đuôi `.js`.
- Mọi bảng nghiệp vụ có cột `org_id`. Bật `ENABLE ROW LEVEL SECURITY` kèm `FORCE ROW LEVEL SECURITY`.
- Mọi hàm repository nhận `orgId` làm tham số đầu tiên.
- Chi phí lưu bằng USD, kiểu `numeric(12, 6)`.
- Không lưu API key hay token dạng plaintext trong cơ sở dữ liệu.
- Tên model của mọi engine đọc từ biến môi trường, có giá trị mặc định trong code.
- Mỗi task kết thúc bằng một commit.

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `packages/shared/src/engine.ts` | Type và zod schema cho `EngineResponse`, `Citation`, `TokenUsage`, interface `Engine` |
| `packages/shared/src/brand.ts` | `BrandProfile`, `CompetitorProfile`, `BrandFact` |
| `packages/shared/src/observation.ts` | `Observation`, `ObservationRow`, `AccuracyFlag` |
| `packages/db/src/schema/tenancy.ts` | `organizations`, `users`, `memberships`, `brands` |
| `packages/db/src/schema/tracking.ts` | `brand_profiles`, `brand_facts`, `competitors`, `prompts`, `engine_configs` |
| `packages/db/src/schema/measurement.ts` | `probe_runs`, `probe_results`, `citations`, `observations`, `daily_metrics` |
| `packages/db/src/schema/ops.ts` | `usage_records` |
| `packages/db/src/client.ts` | Pool, hàm `withOrg` đặt `app.current_org` trong transaction |
| `packages/db/src/repositories/*.ts` | Một file cho mỗi nhóm repository |
| `packages/engines/src/openai.ts` … `serp.ts` | Một file cho mỗi adapter engine |
| `packages/engines/src/cost.ts` | Quy đổi token sang tiền |
| `packages/engines/src/errors.ts` | `EngineError` và cờ `retryable` |
| `packages/extraction/src/candidates.ts` | Tầng 1 — lọc ứng viên bằng từ điển tên |
| `packages/extraction/src/confirm.ts` | Tầng 2 — xác nhận bằng LLM có structured output |
| `packages/extraction/src/index.ts` | Ghép hai tầng, tính `citedOwnDomain` |
| `packages/scoring/src/index.ts` | Tính 6 chỉ số từ danh sách quan sát |
| `packages/probe-engine/src/throttle.ts` | Token bucket trên Redis |
| `packages/probe-engine/src/budget.ts` | Kiểm tra hạn mức chi tiêu của org |
| `packages/probe-engine/src/cache.ts` | Cache câu trả lời thô dùng chung giữa tenant |
| `packages/probe-engine/src/run.ts` | `executeProbeJob`, `finalizeRun` |
| `apps/worker/src/queues.ts` | Khai báo hàng đợi và FlowProducer |
| `apps/worker/src/main.ts` | Worker thường trú + scheduler |
| `apps/worker/src/cli.ts` | Chạy một run ngay lập tức, in chỉ số |

## Danh sách task

1. Khung monorepo và `@geosuite/shared`
2. Schema cơ sở dữ liệu và migration
3. Row-Level Security và test cô lập tenant
4. `withOrg` và repository cấu hình
5. Repository đo lường và sử dụng
6. Interface `Engine` và adapter OpenAI
7. Adapter Perplexity
8. Adapter Gemini
9. Adapter AI Overviews
10. Extraction tầng 1 — lọc ứng viên
11. Extraction tầng 2 — xác nhận bằng LLM
12. Ghép pipeline extraction
13. Tính 6 chỉ số
14. Throttle và ngân sách
15. Cache câu trả lời dùng chung
16. Điều phối probe và độ phủ
17. Worker, scheduler và CLI

---

### Task 1: Khung monorepo và `@geosuite/shared`

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/engine.ts`, `src/brand.ts`, `src/observation.ts`, `src/index.ts`
- Test: `packages/shared/src/engine.test.ts`

**Interfaces:**
- Consumes: không có
- Produces: `EngineId`, `Citation`, `TokenUsage`, `EngineResponse`, `EngineQuery`, `Engine`, `engineResponseSchema`, `BrandProfile`, `CompetitorProfile`, `BrandFact`, `Observation`, `ObservationRow`, `AccuracyFlag`

- [ ] **Step 1: Tạo file cấu hình gốc**

`package.json`:

```json
{
  "name": "geosuite",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc -b --noEmit false",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^22.9.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "composite": true,
    "sourceMap": true,
    "skipLibCheck": true
  }
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
```

- [ ] **Step 2: Tạo package `shared`**

`packages/shared/package.json`:

```json
{
  "name": "@geosuite/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -b" },
  "dependencies": { "zod": "^3.23.8" }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: Viết test thất bại**

`packages/shared/src/engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { engineResponseSchema } from './engine.js'

const valid = {
  engineId: 'openai',
  model: 'gpt-4o',
  text: 'Viettel là nhà mạng lớn nhất Việt Nam.',
  citations: [{ url: 'https://viettel.vn/', title: 'Viettel', position: 1 }],
  latencyMs: 1200,
  usage: { inputTokens: 40, outputTokens: 120, costUsd: 0.0021 },
}

describe('engineResponseSchema', () => {
  it('chấp nhận một phản hồi hợp lệ', () => {
    expect(engineResponseSchema.safeParse(valid).success).toBe(true)
  })

  it('từ chối citation có position nhỏ hơn 1', () => {
    const input = { ...valid, citations: [{ url: 'https://a.com/', title: null, position: 0 }] }
    expect(engineResponseSchema.safeParse(input).success).toBe(false)
  })

  it('từ chối engineId không nằm trong danh sách', () => {
    expect(engineResponseSchema.safeParse({ ...valid, engineId: 'bing' }).success).toBe(false)
  })
})
```

- [ ] **Step 4: Chạy test để xác nhận thất bại**

```bash
pnpm install
pnpm vitest run packages/shared
```

Kỳ vọng: FAIL với `Cannot find module './engine.js'`.

- [ ] **Step 5: Viết `src/engine.ts`**

```ts
import { z } from 'zod'

export const engineIds = ['openai', 'perplexity', 'gemini', 'ai_overviews'] as const
export type EngineId = (typeof engineIds)[number]

export const citationSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable(),
  position: z.number().int().min(1),
})
export type Citation = z.infer<typeof citationSchema>

export const tokenUsageSchema = z.object({
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  costUsd: z.number().min(0),
})
export type TokenUsage = z.infer<typeof tokenUsageSchema>

export const engineResponseSchema = z.object({
  engineId: z.enum(engineIds),
  model: z.string().min(1),
  text: z.string(),
  citations: z.array(citationSchema),
  latencyMs: z.number().int().min(0),
  usage: tokenUsageSchema,
})
export type EngineResponse = z.infer<typeof engineResponseSchema>

export interface EngineQuery {
  prompt: string
  locale: string
}

export interface Engine {
  readonly id: EngineId
  run(query: EngineQuery): Promise<EngineResponse>
}
```

- [ ] **Step 6: Viết `src/brand.ts` và `src/observation.ts`**

`src/brand.ts`:

```ts
export interface BrandFact {
  id: string
  claim: string
}

export interface CompetitorProfile {
  id: string
  name: string
  aliases: string[]
}

export interface BrandProfile {
  brandId: string
  name: string
  aliases: string[]
  domains: string[]
  entityDescription: string
  facts: BrandFact[]
  competitors: CompetitorProfile[]
}
```

`src/observation.ts`:

```ts
import type { EngineId } from './engine.js'

export interface AccuracyFlag {
  factId: string
  statedIncorrectly: string
}

export interface Observation {
  mentioned: boolean
  position: number | null
  sentiment: number | null
  citedOwnDomain: boolean
  competitorIds: string[]
  accuracyFlags: AccuracyFlag[]
}

export interface ObservationRow extends Observation {
  promptId: string
  engineId: EngineId
}
```

`src/index.ts`:

```ts
export * from './engine.js'
export * from './brand.js'
export * from './observation.js'
```

- [ ] **Step 7: Chạy test để xác nhận thành công**

```bash
pnpm vitest run packages/shared
```

Kỳ vọng: PASS, 3 test.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts pnpm-lock.yaml packages/shared
git commit -m "feat: khung monorepo và package shared"
```

---

### Task 2: Schema cơ sở dữ liệu và migration

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`
- Create: `packages/db/src/schema/tenancy.ts`, `tracking.ts`, `measurement.ts`, `ops.ts`, `index.ts`
- Create: `packages/db/src/testing/postgres.ts`
- Test: `packages/db/src/schema/schema.test.ts`

**Interfaces:**
- Consumes: `AccuracyFlag` từ `@geosuite/shared` (Task 1)
- Produces: các bảng Drizzle `organizations`, `users`, `memberships`, `brands`, `brandProfiles`, `brandFacts`, `competitors`, `prompts`, `engineConfigs`, `probeRuns`, `probeResults`, `citations`, `observations`, `dailyMetrics`, `usageRecords`; hàm test `startPostgres(): Promise<PostgresHandle>` với `PostgresHandle = { url: string; stop(): Promise<void> }`

- [ ] **Step 1: Tạo package `db`**

`packages/db/package.json`:

```json
{
  "name": "@geosuite/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -b",
    "generate": "drizzle-kit generate",
    "migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@geosuite/shared": "workspace:*",
    "drizzle-orm": "^0.36.0",
    "pg": "^8.13.1"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "^10.13.2",
    "@types/pg": "^8.11.10",
    "drizzle-kit": "^0.28.0"
  }
}
```

`packages/db/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"],
  "references": [{ "path": "../shared" }]
}
```

`packages/db/drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/geosuite' },
})
```

- [ ] **Step 2: Viết `src/schema/tenancy.ts`**

```ts
import { boolean, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  planTier: text('plan_tier').notNull().default('starter'),
  monthlyBudgetUsd: numeric('monthly_budget_usd', { precision: 12, scale: 6 }).notNull().default('100'),
  sharedCacheEnabled: boolean('shared_cache_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uq: unique('memberships_org_user_uq').on(t.orgId, t.userId) }),
)

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

Vai trò hợp lệ của `memberships.role`: `owner`, `admin`, `editor`, `viewer`.

- [ ] **Step 3: Viết `src/schema/tracking.ts`**

```ts
import { sql } from 'drizzle-orm'
import { boolean, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { brands, organizations } from './tenancy.js'

export const brandProfiles = pgTable(
  'brand_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
    aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
    domains: text('domains').array().notNull().default(sql`'{}'::text[]`),
    entityDescription: text('entity_description').notNull().default(''),
  },
  (t) => ({ uq: unique('brand_profiles_brand_uq').on(t.brandId) }),
)

export const brandFacts = pgTable('brand_facts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  claim: text('claim').notNull(),
})

export const competitors = pgTable('competitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
})

export const prompts = pgTable(
  'prompts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    topic: text('topic').notNull().default(''),
    funnelStage: text('funnel_stage').notNull().default('awareness'),
    locale: text('locale').notNull().default('vi-VN'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byBrand: index('prompts_brand_idx').on(t.orgId, t.brandId, t.active) }),
)

export const engineConfigs = pgTable(
  'engine_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
    engineId: text('engine_id').notNull(),
    enabled: boolean('enabled').notNull().default(true),
  },
  (t) => ({ uq: unique('engine_configs_brand_engine_uq').on(t.brandId, t.engineId) }),
)
```

- [ ] **Step 4: Viết `src/schema/measurement.ts`**

```ts
import { sql } from 'drizzle-orm'
import {
  boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid,
} from 'drizzle-orm/pg-core'
import type { AccuracyFlag } from '@geosuite/shared'
import { brands, organizations } from './tenancy.js'
import { prompts } from './tracking.js'

export const probeRuns = pgTable(
  'probe_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    status: text('status').notNull().default('pending'),
    totalJobs: integer('total_jobs').notNull().default(0),
    succeededJobs: integer('succeeded_jobs').notNull().default(0),
    failedJobs: integer('failed_jobs').notNull().default(0),
    coverage: numeric('coverage', { precision: 5, scale: 4 }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({ byBrandDay: index('probe_runs_brand_day_idx').on(t.orgId, t.brandId, t.day) }),
)

export const probeResults = pgTable(
  'probe_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').notNull().references(() => probeRuns.id, { onDelete: 'cascade' }),
    promptId: uuid('prompt_id').notNull().references(() => prompts.id, { onDelete: 'cascade' }),
    engineId: text('engine_id').notNull(),
    model: text('model').notNull(),
    rawText: text('raw_text').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    cacheHit: boolean('cache_hit').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byRun: index('probe_results_run_idx').on(t.orgId, t.runId) }),
)

export const citations = pgTable(
  'citations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    probeResultId: uuid('probe_result_id').notNull().references(() => probeResults.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    domain: text('domain').notNull(),
    title: text('title'),
    position: integer('position').notNull(),
    isOwnDomain: boolean('is_own_domain').notNull().default(false),
  },
  (t) => ({ byResult: index('citations_result_idx').on(t.orgId, t.probeResultId) }),
)

export const observations = pgTable(
  'observations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').notNull().references(() => probeRuns.id, { onDelete: 'cascade' }),
    promptId: uuid('prompt_id').notNull().references(() => prompts.id, { onDelete: 'cascade' }),
    engineId: text('engine_id').notNull(),
    mentioned: boolean('mentioned').notNull(),
    position: integer('position'),
    sentiment: numeric('sentiment', { precision: 3, scale: 2 }),
    citedOwnDomain: boolean('cited_own_domain').notNull(),
    competitorIds: text('competitor_ids').array().notNull().default(sql`'{}'::text[]`),
    accuracyFlags: jsonb('accuracy_flags').$type<AccuracyFlag[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byRun: index('observations_run_idx').on(t.orgId, t.runId) }),
)

export const dailyMetrics = pgTable(
  'daily_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    visibilityRate: numeric('visibility_rate', { precision: 5, scale: 4 }).notNull(),
    shareOfVoice: numeric('share_of_voice', { precision: 5, scale: 4 }).notNull(),
    citationRate: numeric('citation_rate', { precision: 5, scale: 4 }).notNull(),
    averagePosition: numeric('average_position', { precision: 5, scale: 2 }),
    sentimentScore: numeric('sentiment_score', { precision: 3, scale: 2 }),
    accuracyFlagCount: integer('accuracy_flag_count').notNull(),
    coverage: numeric('coverage', { precision: 5, scale: 4 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uq: unique('daily_metrics_org_brand_day_uq').on(t.orgId, t.brandId, t.day) }),
)
```

- [ ] **Step 5: Viết `src/schema/ops.ts` và `src/schema/index.ts`**

`src/schema/ops.ts`:

```ts
import { index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { organizations } from './tenancy.js'
import { probeRuns } from './measurement.js'

export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').references(() => probeRuns.id, { onDelete: 'set null' }),
    engineId: text('engine_id').notNull(),
    purpose: text('purpose').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byOrgTime: index('usage_records_org_time_idx').on(t.orgId, t.createdAt) }),
)
```

Giá trị hợp lệ của `purpose`: `probe`, `extraction`.

`src/schema/index.ts`:

```ts
export * from './tenancy.js'
export * from './tracking.js'
export * from './measurement.js'
export * from './ops.js'
```

- [ ] **Step 6: Viết helper Testcontainers**

`packages/db/src/testing/postgres.ts`:

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

export interface PostgresHandle {
  url: string
  stop(): Promise<void>
}

const migrationsFolder = fileURLToPath(new URL('../../migrations', import.meta.url))

export async function startPostgres(): Promise<PostgresHandle> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16-alpine').start()
  const url = container.getConnectionUri()
  const pool = new pg.Pool({ connectionString: url })
  await migrate(drizzle(pool), { migrationsFolder })
  await pool.end()
  return {
    url,
    async stop() {
      await container.stop()
    },
  }
}
```

- [ ] **Step 7: Viết test thất bại**

`packages/db/src/schema/schema.test.ts`:

```ts
import { afterAll, beforeAll, expect, it } from 'vitest'
import pg from 'pg'
import { startPostgres, type PostgresHandle } from '../testing/postgres.js'

let handle: PostgresHandle
let pool: pg.Pool

beforeAll(async () => {
  handle = await startPostgres()
  pool = new pg.Pool({ connectionString: handle.url })
})

afterAll(async () => {
  await pool?.end()
  await handle?.stop()
})

it('tạo đủ 15 bảng nghiệp vụ', async () => {
  const { rows } = await pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
  )
  const names = new Set(rows.map((r) => r.table_name))
  for (const table of [
    'organizations', 'users', 'memberships', 'brands',
    'brand_profiles', 'brand_facts', 'competitors', 'prompts', 'engine_configs',
    'probe_runs', 'probe_results', 'citations', 'observations', 'daily_metrics',
    'usage_records',
  ]) {
    expect(names, `thiếu bảng ${table}`).toContain(table)
  }
})

it('mọi bảng nghiệp vụ đều có cột org_id', async () => {
  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT t.table_name FROM information_schema.tables t
     WHERE t.table_schema = 'public'
       AND t.table_name NOT IN ('organizations', 'users', '__drizzle_migrations')
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = t.table_name AND c.column_name = 'org_id'
       )`,
  )
  expect(rows.map((r) => r.table_name)).toEqual([])
})
```

- [ ] **Step 8: Sinh migration và chạy test**

```bash
pnpm install
pnpm --filter @geosuite/db run generate
pnpm vitest run packages/db/src/schema
```

Kỳ vọng: PASS, 2 test. Nếu Docker chưa chạy, test báo lỗi kết nối — khởi động Docker rồi chạy lại.

- [ ] **Step 9: Commit**

```bash
git add packages/db pnpm-lock.yaml
git commit -m "feat(db): schema và migration cho lõi đo lường"
```

---

### Task 3: Row-Level Security và test cô lập tenant

**Files:**
- Create: `packages/db/migrations/0001_rls.sql` (sinh bằng `drizzle-kit generate --custom`)
- Test: `packages/db/src/schema/rls.test.ts`

**Interfaces:**
- Consumes: các bảng từ Task 2, `startPostgres()` từ Task 2
- Produces: hàm SQL `app_current_org()`; policy `org_isolation` trên 13 bảng nghiệp vụ. Mọi truy vấn về sau phải chạy trong transaction có `SET LOCAL app.current_org`.

**Ghi chú thiết kế:** `organizations` và `users` là sổ đăng ký toàn cục, không mang `org_id`, nên không bật RLS — quyền truy cập chúng do tầng ứng dụng kiểm soát. Mọi bảng còn lại bật RLS kèm `FORCE` để chính chủ sở hữu bảng cũng bị ràng buộc.

- [ ] **Step 1: Viết test thất bại**

`packages/db/src/schema/rls.test.ts`:

```ts
import { afterAll, beforeAll, expect, it } from 'vitest'
import pg from 'pg'
import { startPostgres, type PostgresHandle } from '../testing/postgres.js'

let handle: PostgresHandle
let pool: pg.Pool
let orgA: string
let orgB: string

async function asOrg<T>(orgId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT set_config($1, $2, true)', ['app.current_org', orgId])
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

beforeAll(async () => {
  handle = await startPostgres()
  pool = new pg.Pool({ connectionString: handle.url })
  const a = await pool.query<{ id: string }>("INSERT INTO organizations (name) VALUES ('A') RETURNING id")
  const b = await pool.query<{ id: string }>("INSERT INTO organizations (name) VALUES ('B') RETURNING id")
  orgA = a.rows[0]!.id
  orgB = b.rows[0]!.id
  await asOrg(orgA, (c) => c.query('INSERT INTO brands (org_id, name) VALUES ($1, $2)', [orgA, 'Brand A']))
  await asOrg(orgB, (c) => c.query('INSERT INTO brands (org_id, name) VALUES ($1, $2)', [orgB, 'Brand B']))
})

afterAll(async () => {
  await pool?.end()
  await handle?.stop()
})

it('org chỉ đọc được brand của chính mình', async () => {
  const rows = await asOrg(orgA, async (c) => (await c.query<{ name: string }>('SELECT name FROM brands')).rows)
  expect(rows.map((r) => r.name)).toEqual(['Brand A'])
})

it('org không ghi được dữ liệu mang org_id của org khác', async () => {
  await expect(
    asOrg(orgA, (c) => c.query('INSERT INTO brands (org_id, name) VALUES ($1, $2)', [orgB, 'Lén'])),
  ).rejects.toThrow(/row-level security/i)
})

it('không đặt app.current_org thì không đọc được gì', async () => {
  const { rows } = await pool.query('SELECT * FROM brands')
  expect(rows).toEqual([])
})
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

```bash
pnpm vitest run packages/db/src/schema/rls.test.ts
```

Kỳ vọng: FAIL — test thứ nhất trả về cả hai brand, vì RLS chưa bật.

- [ ] **Step 3: Sinh file migration trống**

```bash
pnpm --filter @geosuite/db exec drizzle-kit generate --custom --name rls
```

Lệnh này tạo `packages/db/migrations/0001_rls.sql` rỗng.

- [ ] **Step 4: Viết nội dung migration**

`packages/db/migrations/0001_rls.sql`:

```sql
CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_org', true), '')::uuid
$$;
--> statement-breakpoint
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'memberships', 'brands', 'brand_profiles', 'brand_facts', 'competitors',
    'prompts', 'engine_configs', 'probe_runs', 'probe_results', 'citations',
    'observations', 'daily_metrics', 'usage_records'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org())',
      target
    );
  END LOOP;
END $$;
```

- [ ] **Step 5: Chạy test để xác nhận thành công**

```bash
pnpm vitest run packages/db/src/schema
```

Kỳ vọng: PASS, 5 test (2 của Task 2 và 3 của task này).

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations packages/db/src/schema/rls.test.ts
git commit -m "feat(db): bật RLS và test cô lập tenant"
```

---

### Task 4: `withOrg` và repository cấu hình

**Files:**
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/repositories/organizations.ts`, `brands.ts`, `prompts.ts`
- Create: `packages/db/src/index.ts`
- Test: `packages/db/src/repositories/brands.test.ts`

**Interfaces:**
- Consumes: schema từ Task 2, RLS từ Task 3, `BrandProfile` từ `@geosuite/shared`
- Produces:
  - `createPool(url: string): pg.Pool`
  - `withOrg<T>(pool, orgId, fn: (tx: Tx) => Promise<T>): Promise<T>` với `Tx = NodePgDatabase<typeof schema>`
  - `OrganizationRepository.getSettings(orgId): Promise<OrgSettings>` với `OrgSettings = { monthlyBudgetUsd: number; sharedCacheEnabled: boolean }`
  - `OrganizationRepository.listAll(): Promise<{ id: string }[]>`
  - `BrandRepository.getProfile(orgId, brandId): Promise<BrandProfile>`
  - `BrandRepository.listByOrg(orgId): Promise<{ id: string; name: string }[]>`
  - `PromptRepository.listActive(orgId, brandId): Promise<PromptRow[]>` với `PromptRow = { id: string; text: string; locale: string }`
  - `EngineConfigRepository.listEnabled(orgId, brandId): Promise<EngineId[]>`

- [ ] **Step 1: Viết `src/client.ts`**

```ts
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema/index.js'

export type Tx = NodePgDatabase<typeof schema>

export function createPool(url: string): pg.Pool {
  return new pg.Pool({ connectionString: url })
}

export async function withOrg<T>(pool: pg.Pool, orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT set_config($1, $2, true)', ['app.current_org', orgId])
    const result = await fn(drizzle(client, { schema }))
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
```

`set_config(..., true)` giới hạn phạm vi trong transaction, nên connection trả về pool không mang theo org của lần dùng trước.

- [ ] **Step 2: Viết test thất bại**

`packages/db/src/repositories/brands.test.ts`:

```ts
import { afterAll, beforeAll, expect, it } from 'vitest'
import pg from 'pg'
import { startPostgres, type PostgresHandle } from '../testing/postgres.js'
import { createPool } from '../client.js'
import { createBrandRepository } from './brands.js'
import { createPromptRepository } from './prompts.js'

let handle: PostgresHandle
let pool: pg.Pool
let orgId: string
let brandId: string

beforeAll(async () => {
  handle = await startPostgres()
  pool = createPool(handle.url)
  const org = await pool.query<{ id: string }>("INSERT INTO organizations (name) VALUES ('A') RETURNING id")
  orgId = org.rows[0]!.id
  const client = await pool.connect()
  await client.query('BEGIN')
  await client.query('SELECT set_config($1, $2, true)', ['app.current_org', orgId])
  const brand = await client.query<{ id: string }>(
    'INSERT INTO brands (org_id, name) VALUES ($1, $2) RETURNING id', [orgId, 'Viettel'],
  )
  brandId = brand.rows[0]!.id
  await client.query(
    `INSERT INTO brand_profiles (org_id, brand_id, aliases, domains, entity_description)
     VALUES ($1, $2, ARRAY['Viettel Telecom'], ARRAY['viettel.vn'], 'Nhà mạng viễn thông')`,
    [orgId, brandId],
  )
  await client.query('INSERT INTO brand_facts (org_id, brand_id, claim) VALUES ($1, $2, $3)', [
    orgId, brandId, 'Viettel có hơn 70 triệu thuê bao',
  ])
  await client.query(
    "INSERT INTO competitors (org_id, brand_id, name, aliases) VALUES ($1, $2, 'VinaPhone', ARRAY['Vinaphone'])",
    [orgId, brandId],
  )
  await client.query(
    "INSERT INTO prompts (org_id, brand_id, text, locale, active) VALUES ($1, $2, 'Nhà mạng nào tốt nhất?', 'vi-VN', true)",
    [orgId, brandId],
  )
  await client.query(
    "INSERT INTO prompts (org_id, brand_id, text, locale, active) VALUES ($1, $2, 'Câu đã tắt', 'vi-VN', false)",
    [orgId, brandId],
  )
  await client.query('COMMIT')
  client.release()
})

afterAll(async () => {
  await pool?.end()
  await handle?.stop()
})

it('getProfile trả về hồ sơ đầy đủ kèm đối thủ và dữ kiện', async () => {
  const repo = createBrandRepository(pool)
  const profile = await repo.getProfile(orgId, brandId)
  expect(profile.name).toBe('Viettel')
  expect(profile.aliases).toEqual(['Viettel Telecom'])
  expect(profile.domains).toEqual(['viettel.vn'])
  expect(profile.facts).toHaveLength(1)
  expect(profile.competitors[0]?.name).toBe('VinaPhone')
})

it('listActive bỏ qua prompt đã tắt', async () => {
  const repo = createPromptRepository(pool)
  const rows = await repo.listActive(orgId, brandId)
  expect(rows.map((r) => r.text)).toEqual(['Nhà mạng nào tốt nhất?'])
})

it('listByOrg liệt kê brand trong phạm vi org', async () => {
  const repo = createBrandRepository(pool)
  const rows = await repo.listByOrg(orgId)
  expect(rows).toEqual([{ id: brandId, name: 'Viettel' }])
})

it('listAll liệt kê mọi org để scheduler duyệt qua', async () => {
  const repo = createOrganizationRepository(pool)
  const rows = await repo.listAll()
  expect(rows.map((r) => r.id)).toContain(orgId)
})
```

Thêm import vào đầu file test:

```ts
import { createOrganizationRepository } from './organizations.js'
```

- [ ] **Step 3: Chạy test để xác nhận thất bại**

```bash
pnpm vitest run packages/db/src/repositories
```

Kỳ vọng: FAIL với `Cannot find module './brands.js'`.

- [ ] **Step 4: Viết `src/repositories/brands.ts`**

```ts
import { eq } from 'drizzle-orm'
import type pg from 'pg'
import type { BrandProfile } from '@geosuite/shared'
import { withOrg } from '../client.js'
import { brandFacts, brandProfiles, brands, competitors } from '../schema/index.js'

export interface BrandRepository {
  getProfile(orgId: string, brandId: string): Promise<BrandProfile>
  listByOrg(orgId: string): Promise<{ id: string; name: string }[]>
}

export function createBrandRepository(pool: pg.Pool): BrandRepository {
  return {
    async listByOrg(orgId) {
      return withOrg(pool, orgId, async (tx) => tx.select({ id: brands.id, name: brands.name }).from(brands))
    },
    async getProfile(orgId, brandId) {
      return withOrg(pool, orgId, async (tx) => {
        const [brand] = await tx.select().from(brands).where(eq(brands.id, brandId))
        if (!brand) throw new Error(`Không tìm thấy brand ${brandId}`)
        const [profile] = await tx.select().from(brandProfiles).where(eq(brandProfiles.brandId, brandId))
        const facts = await tx.select().from(brandFacts).where(eq(brandFacts.brandId, brandId))
        const rivals = await tx.select().from(competitors).where(eq(competitors.brandId, brandId))
        return {
          brandId,
          name: brand.name,
          aliases: profile?.aliases ?? [],
          domains: profile?.domains ?? [],
          entityDescription: profile?.entityDescription ?? '',
          facts: facts.map((f) => ({ id: f.id, claim: f.claim })),
          competitors: rivals.map((c) => ({ id: c.id, name: c.name, aliases: c.aliases })),
        }
      })
    },
  }
}
```

- [ ] **Step 5: Viết `src/repositories/prompts.ts` và `organizations.ts`**

`src/repositories/prompts.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import type pg from 'pg'
import type { EngineId } from '@geosuite/shared'
import { withOrg } from '../client.js'
import { engineConfigs, prompts } from '../schema/index.js'

export interface PromptRow {
  id: string
  text: string
  locale: string
}

export interface PromptRepository {
  listActive(orgId: string, brandId: string): Promise<PromptRow[]>
}

export function createPromptRepository(pool: pg.Pool): PromptRepository {
  return {
    async listActive(orgId, brandId) {
      return withOrg(pool, orgId, async (tx) => {
        const rows = await tx
          .select({ id: prompts.id, text: prompts.text, locale: prompts.locale })
          .from(prompts)
          .where(and(eq(prompts.brandId, brandId), eq(prompts.active, true)))
        return rows
      })
    },
  }
}

export interface EngineConfigRepository {
  listEnabled(orgId: string, brandId: string): Promise<EngineId[]>
}

export function createEngineConfigRepository(pool: pg.Pool): EngineConfigRepository {
  return {
    async listEnabled(orgId, brandId) {
      return withOrg(pool, orgId, async (tx) => {
        const rows = await tx
          .select({ engineId: engineConfigs.engineId })
          .from(engineConfigs)
          .where(and(eq(engineConfigs.brandId, brandId), eq(engineConfigs.enabled, true)))
        return rows.map((r) => r.engineId as EngineId)
      })
    },
  }
}
```

`src/repositories/organizations.ts`:

```ts
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import type pg from 'pg'
import { organizations } from '../schema/index.js'

export interface OrgSettings {
  monthlyBudgetUsd: number
  sharedCacheEnabled: boolean
}

export interface OrganizationRepository {
  getSettings(orgId: string): Promise<OrgSettings>
  listAll(): Promise<{ id: string }[]>
}

export function createOrganizationRepository(pool: pg.Pool): OrganizationRepository {
  const db = drizzle(pool)
  return {
    async listAll() {
      return db.select({ id: organizations.id }).from(organizations)
    },
    async getSettings(orgId) {
      const [row] = await db.select().from(organizations).where(eq(organizations.id, orgId))
      if (!row) throw new Error(`Không tìm thấy organization ${orgId}`)
      return {
        monthlyBudgetUsd: Number(row.monthlyBudgetUsd),
        sharedCacheEnabled: row.sharedCacheEnabled,
      }
    },
  }
}
```

`organizations` không bật RLS nên repository này không dùng `withOrg`.

- [ ] **Step 6: Viết `src/index.ts`**

```ts
export * from './client.js'
export * from './schema/index.js'
export * from './repositories/organizations.js'
export * from './repositories/brands.js'
export * from './repositories/prompts.js'
```

- [ ] **Step 7: Chạy test để xác nhận thành công**

```bash
pnpm vitest run packages/db/src/repositories
```

Kỳ vọng: PASS, 4 test.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): withOrg và repository cấu hình"
```

---

### Task 5: Repository đo lường và sử dụng

**Files:**
- Create: `packages/db/src/repositories/measurement.ts`, `usage.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/repositories/measurement.test.ts`

**Interfaces:**
- Consumes: `withOrg` (Task 4), schema đo lường (Task 2), `Observation`, `ObservationRow`, `Citation`, `EngineId` từ `@geosuite/shared`
- Produces:
  - `ProbeRunRepository.create(orgId, input: { brandId; day; totalJobs }): Promise<string>`
  - `ProbeRunRepository.markJob(orgId, runId, outcome: 'succeeded' | 'failed'): Promise<void>`
  - `ProbeRunRepository.complete(orgId, runId, coverage: number): Promise<void>`
  - `ProbeResultRepository.insert(orgId, input: ProbeResultInput): Promise<string>`
  - `ObservationRepository.insert(orgId, input: ObservationInput): Promise<void>`
  - `ObservationRepository.listByRun(orgId, runId): Promise<ObservationRow[]>`
  - `DailyMetricRepository.upsert(orgId, input: DailyMetricInput): Promise<void>`
  - `UsageRepository.record(orgId, input: UsageInput): Promise<void>`
  - `UsageRepository.spentThisMonth(orgId): Promise<number>`

- [ ] **Step 1: Viết test thất bại**

`packages/db/src/repositories/measurement.test.ts`:

```ts
import { afterAll, beforeAll, expect, it } from 'vitest'
import pg from 'pg'
import { startPostgres, type PostgresHandle } from '../testing/postgres.js'
import { createPool } from '../client.js'
import {
  createDailyMetricRepository, createObservationRepository,
  createProbeResultRepository, createProbeRunRepository,
} from './measurement.js'
import { createUsageRepository } from './usage.js'

let handle: PostgresHandle
let pool: pg.Pool
let orgId: string
let brandId: string
let promptId: string

beforeAll(async () => {
  handle = await startPostgres()
  pool = createPool(handle.url)
  const org = await pool.query<{ id: string }>("INSERT INTO organizations (name) VALUES ('A') RETURNING id")
  orgId = org.rows[0]!.id
  const client = await pool.connect()
  await client.query('BEGIN')
  await client.query('SELECT set_config($1, $2, true)', ['app.current_org', orgId])
  const brand = await client.query<{ id: string }>(
    "INSERT INTO brands (org_id, name) VALUES ($1, 'Viettel') RETURNING id", [orgId],
  )
  brandId = brand.rows[0]!.id
  const prompt = await client.query<{ id: string }>(
    "INSERT INTO prompts (org_id, brand_id, text) VALUES ($1, $2, 'Nhà mạng nào tốt nhất?') RETURNING id",
    [orgId, brandId],
  )
  promptId = prompt.rows[0]!.id
  await client.query('COMMIT')
  client.release()
})

afterAll(async () => {
  await pool?.end()
  await handle?.stop()
})

it('ghi và đọc lại một chu trình run hoàn chỉnh', async () => {
  const runs = createProbeRunRepository(pool)
  const results = createProbeResultRepository(pool)
  const observations = createObservationRepository(pool)
  const metrics = createDailyMetricRepository(pool)

  const runId = await runs.create(orgId, { brandId, day: '2026-08-06', totalJobs: 2 })

  const resultId = await results.insert(orgId, {
    runId, promptId, engineId: 'openai', model: 'gpt-4o',
    rawText: 'Viettel dẫn đầu.', latencyMs: 900, cacheHit: false,
    citations: [{ url: 'https://viettel.vn/goi-cuoc', title: 'Gói cước', position: 1 }],
    ownDomains: ['viettel.vn'],
  })
  expect(resultId).toMatch(/^[0-9a-f-]{36}$/)

  await observations.insert(orgId, {
    runId, promptId, engineId: 'openai',
    mentioned: true, position: 1, sentiment: 0.6, citedOwnDomain: true,
    competitorIds: ['c1'], accuracyFlags: [],
  })

  await runs.markJob(orgId, runId, 'succeeded')
  await runs.markJob(orgId, runId, 'failed')
  await runs.complete(orgId, runId, 0.5)

  const rows = await observations.listByRun(orgId, runId)
  expect(rows).toEqual([
    {
      promptId, engineId: 'openai', mentioned: true, position: 1, sentiment: 0.6,
      citedOwnDomain: true, competitorIds: ['c1'], accuracyFlags: [],
    },
  ])

  await metrics.upsert(orgId, {
    brandId, day: '2026-08-06',
    visibilityRate: 1, shareOfVoice: 0.5, citationRate: 1,
    averagePosition: 1, sentimentScore: 0.6, accuracyFlagCount: 0, coverage: 0.5,
  })
  await metrics.upsert(orgId, {
    brandId, day: '2026-08-06',
    visibilityRate: 0.9, shareOfVoice: 0.5, citationRate: 1,
    averagePosition: 1, sentimentScore: 0.6, accuracyFlagCount: 0, coverage: 1,
  })
  const { rows: metricRows } = await pool.query('SELECT count(*)::int AS n FROM daily_metrics')
  expect(metricRows[0]!.n).toBe(1)
})

it('gắn cờ citation thuộc domain của brand', async () => {
  const { rows } = await pool.query<{ is_own_domain: boolean; domain: string }>(
    'SELECT domain, is_own_domain FROM citations',
  )
  expect(rows[0]).toEqual({ domain: 'viettel.vn', is_own_domain: true })
})

it('spentThisMonth cộng dồn chi phí trong tháng', async () => {
  const usage = createUsageRepository(pool)
  await usage.record(orgId, { engineId: 'openai', purpose: 'probe', inputTokens: 10, outputTokens: 20, costUsd: 0.25 })
  await usage.record(orgId, { engineId: 'openai', purpose: 'extraction', inputTokens: 5, outputTokens: 5, costUsd: 0.75 })
  expect(await usage.spentThisMonth(orgId)).toBeCloseTo(1, 6)
})
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

```bash
pnpm vitest run packages/db/src/repositories/measurement.test.ts
```

Kỳ vọng: FAIL với `Cannot find module './measurement.js'`.

- [ ] **Step 3: Viết `src/repositories/measurement.ts`**

```ts
import { eq, sql } from 'drizzle-orm'
import type pg from 'pg'
import type { AccuracyFlag, Citation, EngineId, ObservationRow } from '@geosuite/shared'
import { withOrg } from '../client.js'
import { citations, dailyMetrics, observations, probeResults, probeRuns } from '../schema/index.js'

export interface ProbeRunRepository {
  create(orgId: string, input: { brandId: string; day: string; totalJobs: number }): Promise<string>
  markJob(orgId: string, runId: string, outcome: 'succeeded' | 'failed'): Promise<void>
  complete(orgId: string, runId: string, coverage: number): Promise<void>
}

export function createProbeRunRepository(pool: pg.Pool): ProbeRunRepository {
  return {
    async create(orgId, input) {
      return withOrg(pool, orgId, async (tx) => {
        const [row] = await tx
          .insert(probeRuns)
          .values({ orgId, brandId: input.brandId, day: input.day, totalJobs: input.totalJobs, status: 'running' })
          .returning({ id: probeRuns.id })
        return row!.id
      })
    },
    async markJob(orgId, runId, outcome) {
      const column = outcome === 'succeeded' ? probeRuns.succeededJobs : probeRuns.failedJobs
      await withOrg(pool, orgId, async (tx) => {
        await tx
          .update(probeRuns)
          .set({ [outcome === 'succeeded' ? 'succeededJobs' : 'failedJobs']: sql`${column} + 1` })
          .where(eq(probeRuns.id, runId))
      })
    },
    async complete(orgId, runId, coverage) {
      await withOrg(pool, orgId, async (tx) => {
        await tx
          .update(probeRuns)
          .set({ status: 'completed', coverage: coverage.toFixed(4), completedAt: new Date() })
          .where(eq(probeRuns.id, runId))
      })
    },
  }
}

export interface ProbeResultInput {
  runId: string
  promptId: string
  engineId: EngineId
  model: string
  rawText: string
  latencyMs: number
  cacheHit: boolean
  citations: Citation[]
  ownDomains: string[]
}

export interface ProbeResultRepository {
  insert(orgId: string, input: ProbeResultInput): Promise<string>
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

export function isOwnDomain(url: string, domains: string[]): boolean {
  const host = hostnameOf(url)
  if (host === '') return false
  return domains.some((raw) => {
    const domain = raw.replace(/^www\./, '').toLowerCase()
    return host === domain || host.endsWith(`.${domain}`)
  })
}

export function createProbeResultRepository(pool: pg.Pool): ProbeResultRepository {
  return {
    async insert(orgId, input) {
      return withOrg(pool, orgId, async (tx) => {
        const [row] = await tx
          .insert(probeResults)
          .values({
            orgId, runId: input.runId, promptId: input.promptId, engineId: input.engineId,
            model: input.model, rawText: input.rawText, latencyMs: input.latencyMs, cacheHit: input.cacheHit,
          })
          .returning({ id: probeResults.id })
        const resultId = row!.id
        if (input.citations.length > 0) {
          await tx.insert(citations).values(
            input.citations.map((c) => ({
              orgId, probeResultId: resultId, url: c.url, domain: hostnameOf(c.url),
              title: c.title, position: c.position, isOwnDomain: isOwnDomain(c.url, input.ownDomains),
            })),
          )
        }
        return resultId
      })
    },
  }
}

export interface ObservationInput extends ObservationRow {
  runId: string
}

export interface ObservationRepository {
  insert(orgId: string, input: ObservationInput): Promise<void>
  listByRun(orgId: string, runId: string): Promise<ObservationRow[]>
}

export function createObservationRepository(pool: pg.Pool): ObservationRepository {
  return {
    async insert(orgId, input) {
      await withOrg(pool, orgId, async (tx) => {
        await tx.insert(observations).values({
          orgId, runId: input.runId, promptId: input.promptId, engineId: input.engineId,
          mentioned: input.mentioned, position: input.position,
          sentiment: input.sentiment === null ? null : input.sentiment.toFixed(2),
          citedOwnDomain: input.citedOwnDomain, competitorIds: input.competitorIds,
          accuracyFlags: input.accuracyFlags,
        })
      })
    },
    async listByRun(orgId, runId) {
      return withOrg(pool, orgId, async (tx) => {
        const rows = await tx.select().from(observations).where(eq(observations.runId, runId))
        return rows.map((r) => ({
          promptId: r.promptId,
          engineId: r.engineId as EngineId,
          mentioned: r.mentioned,
          position: r.position,
          sentiment: r.sentiment === null ? null : Number(r.sentiment),
          citedOwnDomain: r.citedOwnDomain,
          competitorIds: r.competitorIds,
          accuracyFlags: r.accuracyFlags as AccuracyFlag[],
        }))
      })
    },
  }
}

export interface DailyMetricInput {
  brandId: string
  day: string
  visibilityRate: number
  shareOfVoice: number
  citationRate: number
  averagePosition: number | null
  sentimentScore: number | null
  accuracyFlagCount: number
  coverage: number
}

export interface DailyMetricRepository {
  upsert(orgId: string, input: DailyMetricInput): Promise<void>
}

export function createDailyMetricRepository(pool: pg.Pool): DailyMetricRepository {
  return {
    async upsert(orgId, input) {
      const values = {
        orgId, brandId: input.brandId, day: input.day,
        visibilityRate: input.visibilityRate.toFixed(4),
        shareOfVoice: input.shareOfVoice.toFixed(4),
        citationRate: input.citationRate.toFixed(4),
        averagePosition: input.averagePosition === null ? null : input.averagePosition.toFixed(2),
        sentimentScore: input.sentimentScore === null ? null : input.sentimentScore.toFixed(2),
        accuracyFlagCount: input.accuracyFlagCount,
        coverage: input.coverage.toFixed(4),
        updatedAt: new Date(),
      }
      await withOrg(pool, orgId, async (tx) => {
        await tx
          .insert(dailyMetrics)
          .values(values)
          .onConflictDoUpdate({
            target: [dailyMetrics.orgId, dailyMetrics.brandId, dailyMetrics.day],
            set: values,
          })
      })
    },
  }
}
```

- [ ] **Step 4: Viết `src/repositories/usage.ts`**

```ts
import { and, eq, gte, sql } from 'drizzle-orm'
import type pg from 'pg'
import type { EngineId } from '@geosuite/shared'
import { withOrg } from '../client.js'
import { usageRecords } from '../schema/index.js'

export interface UsageInput {
  runId?: string
  engineId: EngineId
  purpose: 'probe' | 'extraction'
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export interface UsageRepository {
  record(orgId: string, input: UsageInput): Promise<void>
  spentThisMonth(orgId: string): Promise<number>
}

export function createUsageRepository(pool: pg.Pool): UsageRepository {
  return {
    async record(orgId, input) {
      await withOrg(pool, orgId, async (tx) => {
        await tx.insert(usageRecords).values({
          orgId, runId: input.runId ?? null, engineId: input.engineId, purpose: input.purpose,
          inputTokens: input.inputTokens, outputTokens: input.outputTokens,
          costUsd: input.costUsd.toFixed(6),
        })
      })
    },
    async spentThisMonth(orgId) {
      return withOrg(pool, orgId, async (tx) => {
        const [row] = await tx
          .select({ total: sql<string>`coalesce(sum(${usageRecords.costUsd}), 0)` })
          .from(usageRecords)
          .where(and(eq(usageRecords.orgId, orgId), gte(usageRecords.createdAt, sql`date_trunc('month', now())`)))
        return Number(row?.total ?? 0)
      })
    },
  }
}
```

- [ ] **Step 5: Cập nhật `src/index.ts`**

Thêm hai dòng vào cuối file:

```ts
export * from './repositories/measurement.js'
export * from './repositories/usage.js'
```

- [ ] **Step 6: Chạy test để xác nhận thành công**

```bash
pnpm vitest run packages/db
```

Kỳ vọng: PASS, 12 test.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): repository đo lường và ghi nhận chi phí"
```

---

### Task 6: Interface `Engine` và adapter OpenAI

**Files:**
- Create: `packages/engines/package.json`, `packages/engines/tsconfig.json`
- Create: `packages/engines/src/errors.ts`, `src/cost.ts`, `src/openai.ts`, `src/index.ts`
- Test: `packages/engines/src/openai.test.ts`

**Interfaces:**
- Consumes: `Engine`, `EngineQuery`, `EngineResponse`, `Citation`, `EngineId` từ `@geosuite/shared`
- Produces:
  - `class EngineError extends Error` với `engineId`, `status`, `body`, getter `retryable`
  - `tokenCost(inputTokens, outputTokens, inputCostPerMTok, outputCostPerMTok): number`
  - `createOpenAiEngine(config: OpenAiConfig): Engine`
  - `OpenAiConfig = { apiKey; model; baseUrl?; inputCostPerMTok; outputCostPerMTok; fetchImpl? }`

**Ghi chú thiết kế:** mọi adapter gọi HTTP bằng `fetch` thay vì SDK riêng của từng nhà cung cấp. Lý do: bốn adapter dùng chung một khuôn xử lý lỗi và tính chi phí, và test bằng `msw` chặn ở tầng HTTP nên không phụ thuộc phiên bản SDK.

- [ ] **Step 1: Tạo package `engines`**

`packages/engines/package.json`:

```json
{
  "name": "@geosuite/engines",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -b" },
  "dependencies": { "@geosuite/shared": "workspace:*" },
  "devDependencies": { "msw": "^2.6.4" }
}
```

`packages/engines/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 2: Viết test thất bại**

`packages/engines/src/openai.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createOpenAiEngine } from './openai.js'
import { EngineError } from './errors.js'

const body = {
  model: 'gpt-4o-2024-11-20',
  output: [
    {
      type: 'message',
      content: [
        {
          type: 'output_text',
          text: 'Viettel là nhà mạng có vùng phủ rộng nhất.',
          annotations: [
            { type: 'url_citation', url: 'https://viettel.vn/', title: 'Viettel' },
            { type: 'url_citation', url: 'https://vnexpress.net/vien-thong', title: 'VnExpress' },
          ],
        },
      ],
    },
  ],
  usage: { input_tokens: 120, output_tokens: 340 },
}

const server = setupServer(
  http.post('https://api.openai.test/v1/responses', () => HttpResponse.json(body)),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function engine() {
  return createOpenAiEngine({
    apiKey: 'test-key',
    model: 'gpt-4o',
    baseUrl: 'https://api.openai.test/v1',
    inputCostPerMTok: 2.5,
    outputCostPerMTok: 10,
  })
}

it('trả về text, citation và chi phí đã quy đổi', async () => {
  const result = await engine().run({ prompt: 'Nhà mạng nào tốt nhất?', locale: 'vi-VN' })
  expect(result.engineId).toBe('openai')
  expect(result.model).toBe('gpt-4o-2024-11-20')
  expect(result.text).toBe('Viettel là nhà mạng có vùng phủ rộng nhất.')
  expect(result.citations).toEqual([
    { url: 'https://viettel.vn/', title: 'Viettel', position: 1 },
    { url: 'https://vnexpress.net/vien-thong', title: 'VnExpress', position: 2 },
  ])
  expect(result.usage.costUsd).toBeCloseTo(120 / 1e6 * 2.5 + 340 / 1e6 * 10, 9)
  expect(result.latencyMs).toBeGreaterThanOrEqual(0)
})

it('loại bỏ citation trùng URL, giữ lần xuất hiện đầu', async () => {
  server.use(
    http.post('https://api.openai.test/v1/responses', () =>
      HttpResponse.json({
        ...body,
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: 'x',
                annotations: [
                  { type: 'url_citation', url: 'https://viettel.vn/', title: 'A' },
                  { type: 'url_citation', url: 'https://viettel.vn/', title: 'B' },
                ],
              },
            ],
          },
        ],
      }),
    ),
  )
  const result = await engine().run({ prompt: 'x', locale: 'vi-VN' })
  expect(result.citations).toEqual([{ url: 'https://viettel.vn/', title: 'A', position: 1 }])
})

it('ném EngineError có thể retry khi máy chủ trả 429', async () => {
  server.use(
    http.post('https://api.openai.test/v1/responses', () => new HttpResponse('rate limited', { status: 429 })),
  )
  const error = await engine().run({ prompt: 'x', locale: 'vi-VN' }).catch((e: unknown) => e)
  expect(error).toBeInstanceOf(EngineError)
  expect((error as EngineError).retryable).toBe(true)
})

it('ném EngineError không retry khi máy chủ trả 400', async () => {
  server.use(
    http.post('https://api.openai.test/v1/responses', () => new HttpResponse('bad request', { status: 400 })),
  )
  const error = await engine().run({ prompt: 'x', locale: 'vi-VN' }).catch((e: unknown) => e)
  expect((error as EngineError).retryable).toBe(false)
})
```

- [ ] **Step 3: Chạy test để xác nhận thất bại**

```bash
pnpm install
pnpm vitest run packages/engines
```

Kỳ vọng: FAIL với `Cannot find module './openai.js'`.

- [ ] **Step 4: Viết `src/errors.ts` và `src/cost.ts`**

`src/errors.ts`:

```ts
import type { EngineId } from '@geosuite/shared'

export class EngineError extends Error {
  constructor(
    readonly engineId: EngineId,
    readonly status: number,
    readonly body: string,
  ) {
    super(`${engineId} trả về mã ${status}`)
    this.name = 'EngineError'
  }

  get retryable(): boolean {
    return this.status === 408 || this.status === 429 || this.status >= 500
  }
}
```

`src/cost.ts`:

```ts
export function tokenCost(
  inputTokens: number,
  outputTokens: number,
  inputCostPerMTok: number,
  outputCostPerMTok: number,
): number {
  return (inputTokens / 1_000_000) * inputCostPerMTok + (outputTokens / 1_000_000) * outputCostPerMTok
}

export function dedupeCitations<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const kept: T[] = []
  for (const item of items) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    kept.push(item)
  }
  return kept
}
```

- [ ] **Step 5: Viết `src/openai.ts`**

```ts
import type { Citation, Engine, EngineQuery, EngineResponse } from '@geosuite/shared'
import { dedupeCitations, tokenCost } from './cost.js'
import { EngineError } from './errors.js'

export interface OpenAiConfig {
  apiKey: string
  model: string
  baseUrl?: string
  inputCostPerMTok: number
  outputCostPerMTok: number
  fetchImpl?: typeof fetch
}

interface OpenAiAnnotation {
  type: string
  url?: string
  title?: string
}

interface OpenAiContent {
  type: string
  text?: string
  annotations?: OpenAiAnnotation[]
}

interface OpenAiBody {
  model?: string
  output?: { type: string; content?: OpenAiContent[] }[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

function collectContent(body: OpenAiBody): OpenAiContent[] {
  return (body.output ?? []).flatMap((item) => item.content ?? []).filter((c) => c.type === 'output_text')
}

export function createOpenAiEngine(config: OpenAiConfig): Engine {
  const baseUrl = config.baseUrl ?? 'https://api.openai.com/v1'
  const doFetch = config.fetchImpl ?? fetch

  return {
    id: 'openai',
    async run(query: EngineQuery): Promise<EngineResponse> {
      const startedAt = performance.now()
      const response = await doFetch(`${baseUrl}/responses`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          input: query.prompt,
          tools: [{ type: 'web_search' }],
          metadata: { locale: query.locale },
        }),
      })
      if (!response.ok) {
        throw new EngineError('openai', response.status, await response.text())
      }
      const body = (await response.json()) as OpenAiBody
      const latencyMs = Math.round(performance.now() - startedAt)
      const contents = collectContent(body)
      const text = contents.map((c) => c.text ?? '').join('\n').trim()
      const rawCitations = contents
        .flatMap((c) => c.annotations ?? [])
        .filter((a) => a.type === 'url_citation' && typeof a.url === 'string')
        .map((a) => ({ url: a.url as string, title: a.title ?? null }))
      const citations: Citation[] = dedupeCitations(rawCitations).map((c, index) => ({
        url: c.url,
        title: c.title,
        position: index + 1,
      }))
      const inputTokens = body.usage?.input_tokens ?? 0
      const outputTokens = body.usage?.output_tokens ?? 0
      return {
        engineId: 'openai',
        model: body.model ?? config.model,
        text,
        citations,
        latencyMs,
        usage: {
          inputTokens,
          outputTokens,
          costUsd: tokenCost(inputTokens, outputTokens, config.inputCostPerMTok, config.outputCostPerMTok),
        },
      }
    },
  }
}
```

`src/index.ts`:

```ts
export * from './errors.js'
export * from './cost.js'
export * from './openai.js'
```

- [ ] **Step 6: Chạy test để xác nhận thành công**

```bash
pnpm vitest run packages/engines
```

Kỳ vọng: PASS, 4 test.

- [ ] **Step 7: Commit**

```bash
git add packages/engines pnpm-lock.yaml
git commit -m "feat(engines): interface Engine và adapter OpenAI"
```

---

### Task 7: Adapter Perplexity

**Files:**
- Create: `packages/engines/src/perplexity.ts`
- Modify: `packages/engines/src/index.ts`
- Test: `packages/engines/src/perplexity.test.ts`

**Interfaces:**
- Consumes: `tokenCost`, `dedupeCitations` (Task 6), `EngineError` (Task 6)
- Produces: `createPerplexityEngine(config: PerplexityConfig): Engine` với `PerplexityConfig = { apiKey; model; baseUrl?; inputCostPerMTok; outputCostPerMTok; fetchImpl? }`

- [ ] **Step 1: Viết test thất bại**

`packages/engines/src/perplexity.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createPerplexityEngine } from './perplexity.js'

const server = setupServer(
  http.post('https://api.pplx.test/chat/completions', () =>
    HttpResponse.json({
      model: 'sonar-pro',
      choices: [{ message: { content: 'Viettel và VinaPhone là hai nhà mạng lớn.' } }],
      citations: ['https://viettel.vn/', 'https://vnpt.com.vn/'],
      usage: { prompt_tokens: 50, completion_tokens: 200 },
    }),
  ),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

it('chuyển mảng citations dạng chuỗi thành Citation có vị trí', async () => {
  const engine = createPerplexityEngine({
    apiKey: 'k', model: 'sonar-pro', baseUrl: 'https://api.pplx.test',
    inputCostPerMTok: 3, outputCostPerMTok: 15,
  })
  const result = await engine.run({ prompt: 'Nhà mạng nào tốt nhất?', locale: 'vi-VN' })
  expect(result.engineId).toBe('perplexity')
  expect(result.text).toBe('Viettel và VinaPhone là hai nhà mạng lớn.')
  expect(result.citations).toEqual([
    { url: 'https://viettel.vn/', title: null, position: 1 },
    { url: 'https://vnpt.com.vn/', title: null, position: 2 },
  ])
  expect(result.usage.inputTokens).toBe(50)
  expect(result.usage.costUsd).toBeCloseTo(50 / 1e6 * 3 + 200 / 1e6 * 15, 9)
})

it('trả về mảng citation rỗng khi phản hồi không có trường citations', async () => {
  server.use(
    http.post('https://api.pplx.test/chat/completions', () =>
      HttpResponse.json({ model: 'sonar-pro', choices: [{ message: { content: 'x' } }], usage: {} }),
    ),
  )
  const engine = createPerplexityEngine({
    apiKey: 'k', model: 'sonar-pro', baseUrl: 'https://api.pplx.test',
    inputCostPerMTok: 3, outputCostPerMTok: 15,
  })
  const result = await engine.run({ prompt: 'x', locale: 'vi-VN' })
  expect(result.citations).toEqual([])
  expect(result.usage.costUsd).toBe(0)
})
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

```bash
pnpm vitest run packages/engines/src/perplexity.test.ts
```

Kỳ vọng: FAIL với `Cannot find module './perplexity.js'`.

- [ ] **Step 3: Viết `src/perplexity.ts`**

```ts
import type { Citation, Engine, EngineQuery, EngineResponse } from '@geosuite/shared'
import { dedupeCitations, tokenCost } from './cost.js'
import { EngineError } from './errors.js'

export interface PerplexityConfig {
  apiKey: string
  model: string
  baseUrl?: string
  inputCostPerMTok: number
  outputCostPerMTok: number
  fetchImpl?: typeof fetch
}

interface PerplexityBody {
  model?: string
  choices?: { message?: { content?: string } }[]
  citations?: string[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export function createPerplexityEngine(config: PerplexityConfig): Engine {
  const baseUrl = config.baseUrl ?? 'https://api.perplexity.ai'
  const doFetch = config.fetchImpl ?? fetch

  return {
    id: 'perplexity',
    async run(query: EngineQuery): Promise<EngineResponse> {
      const startedAt = performance.now()
      const response = await doFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: query.prompt }],
        }),
      })
      if (!response.ok) {
        throw new EngineError('perplexity', response.status, await response.text())
      }
      const body = (await response.json()) as PerplexityBody
      const latencyMs = Math.round(performance.now() - startedAt)
      const citations: Citation[] = dedupeCitations(
        (body.citations ?? []).map((url) => ({ url, title: null })),
      ).map((c, index) => ({ url: c.url, title: c.title, position: index + 1 }))
      const inputTokens = body.usage?.prompt_tokens ?? 0
      const outputTokens = body.usage?.completion_tokens ?? 0
      return {
        engineId: 'perplexity',
        model: body.model ?? config.model,
        text: body.choices?.[0]?.message?.content ?? '',
        citations,
        latencyMs,
        usage: {
          inputTokens,
          outputTokens,
          costUsd: tokenCost(inputTokens, outputTokens, config.inputCostPerMTok, config.outputCostPerMTok),
        },
      }
    },
  }
}
```

Thêm vào `src/index.ts`:

```ts
export * from './perplexity.js'
```

- [ ] **Step 4: Chạy test để xác nhận thành công**

```bash
pnpm vitest run packages/engines
```

Kỳ vọng: PASS, 6 test.

- [ ] **Step 5: Commit**

```bash
git add packages/engines/src
git commit -m "feat(engines): adapter Perplexity"
```

---

### Task 8: Adapter Gemini

**Files:**
- Create: `packages/engines/src/gemini.ts`
- Modify: `packages/engines/src/index.ts`
- Test: `packages/engines/src/gemini.test.ts`

**Interfaces:**
- Consumes: `tokenCost`, `dedupeCitations`, `EngineError` (Task 6)
- Produces: `createGeminiEngine(config: GeminiConfig): Engine` với `GeminiConfig = { apiKey; model; baseUrl?; inputCostPerMTok; outputCostPerMTok; fetchImpl? }`

- [ ] **Step 1: Viết test thất bại**

`packages/engines/src/gemini.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createGeminiEngine } from './gemini.js'

const server = setupServer(
  http.post('https://gemini.test/v1beta/models/gemini-2.5-flash:generateContent', () =>
    HttpResponse.json({
      modelVersion: 'gemini-2.5-flash-001',
      candidates: [
        {
          content: { parts: [{ text: 'Viettel dẫn đầu về vùng phủ.' }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://viettel.vn/', title: 'Viettel' } },
              { web: { uri: 'https://vnexpress.net/', title: 'VnExpress' } },
            ],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 90 },
    }),
  ),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function engine() {
  return createGeminiEngine({
    apiKey: 'k', model: 'gemini-2.5-flash', baseUrl: 'https://gemini.test/v1beta',
    inputCostPerMTok: 0.3, outputCostPerMTok: 2.5,
  })
}

it('lấy text và grounding chunk làm citation', async () => {
  const result = await engine().run({ prompt: 'Nhà mạng nào tốt nhất?', locale: 'vi-VN' })
  expect(result.engineId).toBe('gemini')
  expect(result.model).toBe('gemini-2.5-flash-001')
  expect(result.text).toBe('Viettel dẫn đầu về vùng phủ.')
  expect(result.citations).toEqual([
    { url: 'https://viettel.vn/', title: 'Viettel', position: 1 },
    { url: 'https://vnexpress.net/', title: 'VnExpress', position: 2 },
  ])
  expect(result.usage.costUsd).toBeCloseTo(30 / 1e6 * 0.3 + 90 / 1e6 * 2.5, 9)
})

it('bật công cụ google_search trong body gửi đi', async () => {
  let sent: unknown
  server.use(
    http.post('https://gemini.test/v1beta/models/gemini-2.5-flash:generateContent', async ({ request }) => {
      sent = await request.json()
      return HttpResponse.json({ candidates: [], usageMetadata: {} })
    }),
  )
  await engine().run({ prompt: 'x', locale: 'vi-VN' })
  expect(sent).toMatchObject({ tools: [{ google_search: {} }] })
})

it('ghép nhiều part thành một chuỗi text', async () => {
  server.use(
    http.post('https://gemini.test/v1beta/models/gemini-2.5-flash:generateContent', () =>
      HttpResponse.json({
        candidates: [{ content: { parts: [{ text: 'Phần một.' }, { text: 'Phần hai.' }] } }],
        usageMetadata: {},
      }),
    ),
  )
  const result = await engine().run({ prompt: 'x', locale: 'vi-VN' })
  expect(result.text).toBe('Phần một.\nPhần hai.')
})
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

```bash
pnpm vitest run packages/engines/src/gemini.test.ts
```

Kỳ vọng: FAIL với `Cannot find module './gemini.js'`.

- [ ] **Step 3: Viết `src/gemini.ts`**

```ts
import type { Citation, Engine, EngineQuery, EngineResponse } from '@geosuite/shared'
import { dedupeCitations, tokenCost } from './cost.js'
import { EngineError } from './errors.js'

export interface GeminiConfig {
  apiKey: string
  model: string
  baseUrl?: string
  inputCostPerMTok: number
  outputCostPerMTok: number
  fetchImpl?: typeof fetch
}

interface GeminiBody {
  modelVersion?: string
  candidates?: {
    content?: { parts?: { text?: string }[] }
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] }
  }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

export function createGeminiEngine(config: GeminiConfig): Engine {
  const baseUrl = config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta'
  const doFetch = config.fetchImpl ?? fetch

  return {
    id: 'gemini',
    async run(query: EngineQuery): Promise<EngineResponse> {
      const startedAt = performance.now()
      const response = await doFetch(`${baseUrl}/models/${config.model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': config.apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: query.prompt }] }],
          tools: [{ google_search: {} }],
        }),
      })
      if (!response.ok) {
        throw new EngineError('gemini', response.status, await response.text())
      }
      const body = (await response.json()) as GeminiBody
      const latencyMs = Math.round(performance.now() - startedAt)
      const candidate = body.candidates?.[0]
      const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('\n').trim()
      const rawCitations = (candidate?.groundingMetadata?.groundingChunks ?? [])
        .map((chunk) => chunk.web)
        .filter((web): web is { uri: string; title?: string } => typeof web?.uri === 'string')
        .map((web) => ({ url: web.uri, title: web.title ?? null }))
      const citations: Citation[] = dedupeCitations(rawCitations).map((c, index) => ({
        url: c.url,
        title: c.title,
        position: index + 1,
      }))
      const inputTokens = body.usageMetadata?.promptTokenCount ?? 0
      const outputTokens = body.usageMetadata?.candidatesTokenCount ?? 0
      return {
        engineId: 'gemini',
        model: body.modelVersion ?? config.model,
        text,
        citations,
        latencyMs,
        usage: {
          inputTokens,
          outputTokens,
          costUsd: tokenCost(inputTokens, outputTokens, config.inputCostPerMTok, config.outputCostPerMTok),
        },
      }
    },
  }
}
```

Thêm vào `src/index.ts`:

```ts
export * from './gemini.js'
```

- [ ] **Step 4: Chạy test để xác nhận thành công**

```bash
pnpm vitest run packages/engines
```

Kỳ vọng: PASS, 9 test.

- [ ] **Step 5: Commit**

```bash
git add packages/engines/src
git commit -m "feat(engines): adapter Gemini"
```

---

### Task 9: Adapter AI Overviews

**Files:**
- Create: `packages/engines/src/serp.ts`
- Modify: `packages/engines/src/index.ts`
- Test: `packages/engines/src/serp.test.ts`

**Interfaces:**
- Consumes: `dedupeCitations`, `EngineError` (Task 6)
- Produces: `createAiOverviewsEngine(config: SerpConfig): Engine` với `SerpConfig = { apiKey; baseUrl?; costPerSearchUsd; googleDomain?; fetchImpl? }`

**Ghi chú thiết kế:** SerpApi tính tiền theo lượt tìm kiếm chứ không theo token, nên `usage.inputTokens` và `usage.outputTokens` luôn bằng 0 còn `costUsd` lấy thẳng từ `costPerSearchUsd`. Khi truy vấn không có AI Overview, adapter trả về `text` rỗng thay vì ném lỗi — đó là kết quả đo hợp lệ, nghĩa là Google không sinh AI Overview cho câu hỏi này.

- [ ] **Step 1: Viết test thất bại**

`packages/engines/src/serp.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createAiOverviewsEngine } from './serp.js'

const server = setupServer(
  http.get('https://serp.test/search', () =>
    HttpResponse.json({
      ai_overview: {
        text_blocks: [
          { type: 'paragraph', snippet: 'Viettel có vùng phủ rộng nhất.' },
          {
            type: 'list',
            list: [{ snippet: 'VinaPhone đứng thứ hai.' }, { snippet: 'MobiFone đứng thứ ba.' }],
          },
        ],
        references: [
          { link: 'https://viettel.vn/', title: 'Viettel', index: 1 },
          { link: 'https://vnpt.com.vn/', title: 'VNPT', index: 2 },
        ],
      },
    }),
  ),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function engine() {
  return createAiOverviewsEngine({
    apiKey: 'k', baseUrl: 'https://serp.test', costPerSearchUsd: 0.015,
  })
}

it('ghép các khối văn bản và lấy reference làm citation', async () => {
  const result = await engine().run({ prompt: 'Nhà mạng nào tốt nhất?', locale: 'vi-VN' })
  expect(result.engineId).toBe('ai_overviews')
  expect(result.text).toBe(
    'Viettel có vùng phủ rộng nhất.\nVinaPhone đứng thứ hai.\nMobiFone đứng thứ ba.',
  )
  expect(result.citations).toEqual([
    { url: 'https://viettel.vn/', title: 'Viettel', position: 1 },
    { url: 'https://vnpt.com.vn/', title: 'VNPT', position: 2 },
  ])
  expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0, costUsd: 0.015 })
})

it('gửi hl và gl suy ra từ locale', async () => {
  let url = ''
  server.use(
    http.get('https://serp.test/search', ({ request }) => {
      url = request.url
      return HttpResponse.json({})
    }),
  )
  await engine().run({ prompt: 'x', locale: 'vi-VN' })
  const params = new URL(url).searchParams
  expect(params.get('hl')).toBe('vi')
  expect(params.get('gl')).toBe('vn')
  expect(params.get('engine')).toBe('google')
})

it('trả về text rỗng khi truy vấn không có AI Overview', async () => {
  server.use(http.get('https://serp.test/search', () => HttpResponse.json({ organic_results: [] })))
  const result = await engine().run({ prompt: 'x', locale: 'vi-VN' })
  expect(result.text).toBe('')
  expect(result.citations).toEqual([])
  expect(result.usage.costUsd).toBe(0.015)
})

it('ném EngineError có thể retry khi nhà cung cấp trả 503', async () => {
  server.use(http.get('https://serp.test/search', () => new HttpResponse('down', { status: 503 })))
  const error = await engine().run({ prompt: 'x', locale: 'vi-VN' }).catch((e: unknown) => e)
  expect((error as { retryable: boolean }).retryable).toBe(true)
})
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

```bash
pnpm vitest run packages/engines/src/serp.test.ts
```

Kỳ vọng: FAIL với `Cannot find module './serp.js'`.

- [ ] **Step 3: Viết `src/serp.ts`**

```ts
import type { Citation, Engine, EngineQuery, EngineResponse } from '@geosuite/shared'
import { dedupeCitations } from './cost.js'
import { EngineError } from './errors.js'

export interface SerpConfig {
  apiKey: string
  baseUrl?: string
  costPerSearchUsd: number
  googleDomain?: string
  fetchImpl?: typeof fetch
}

interface SerpTextBlock {
  type?: string
  snippet?: string
  list?: { snippet?: string }[]
}

interface SerpBody {
  ai_overview?: {
    text_blocks?: SerpTextBlock[]
    references?: { link?: string; title?: string }[]
  }
}

export function localeToHlGl(locale: string): { hl: string; gl: string } {
  const [language = 'en', region = 'us'] = locale.split('-')
  return { hl: language.toLowerCase(), gl: region.toLowerCase() }
}

function flattenBlocks(blocks: SerpTextBlock[]): string {
  const lines: string[] = []
  for (const block of blocks) {
    if (block.snippet) lines.push(block.snippet)
    for (const item of block.list ?? []) {
      if (item.snippet) lines.push(item.snippet)
    }
  }
  return lines.join('\n').trim()
}

export function createAiOverviewsEngine(config: SerpConfig): Engine {
  const baseUrl = config.baseUrl ?? 'https://serpapi.com'
  const doFetch = config.fetchImpl ?? fetch

  return {
    id: 'ai_overviews',
    async run(query: EngineQuery): Promise<EngineResponse> {
      const startedAt = performance.now()
      const { hl, gl } = localeToHlGl(query.locale)
      const params = new URLSearchParams({
        engine: 'google',
        q: query.prompt,
        hl,
        gl,
        google_domain: config.googleDomain ?? 'google.com',
        api_key: config.apiKey,
      })
      const response = await doFetch(`${baseUrl}/search?${params.toString()}`)
      if (!response.ok) {
        throw new EngineError('ai_overviews', response.status, await response.text())
      }
      const body = (await response.json()) as SerpBody
      const latencyMs = Math.round(performance.now() - startedAt)
      const overview = body.ai_overview
      const rawCitations = (overview?.references ?? [])
        .filter((ref): ref is { link: string; title?: string } => typeof ref.link === 'string')
        .map((ref) => ({ url: ref.link, title: ref.title ?? null }))
      const citations: Citation[] = dedupeCitations(rawCitations).map((c, index) => ({
        url: c.url,
        title: c.title,
        position: index + 1,
      }))
      return {
        engineId: 'ai_overviews',
        model: 'google-ai-overview',
        text: flattenBlocks(overview?.text_blocks ?? []),
        citations,
        latencyMs,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: config.costPerSearchUsd },
      }
    },
  }
}
```

Thêm vào `src/index.ts`:

```ts
export * from './serp.js'
```

- [ ] **Step 4: Chạy test để xác nhận thành công**

```bash
pnpm vitest run packages/engines
```

Kỳ vọng: PASS, 13 test.

- [ ] **Step 5: Commit**

```bash
git add packages/engines/src
git commit -m "feat(engines): adapter Google AI Overviews qua SerpApi"
```

---

### Task 10: Extraction tầng 1 — lọc ứng viên

**Files:**
- Create: `packages/extraction/package.json`, `packages/extraction/tsconfig.json`
- Create: `packages/extraction/src/candidates.ts`
- Test: `packages/extraction/src/candidates.test.ts`

**Interfaces:**
- Consumes: `BrandProfile` từ `@geosuite/shared`
- Produces:
  - `CandidateMatch = { entityId: string; entityName: string; offset: number }`
  - `findCandidates(text: string, brand: BrandProfile): CandidateMatch[]` — trả về tối đa một match cho mỗi thực thể (lần xuất hiện sớm nhất), sắp xếp tăng dần theo `offset`

**Ghi chú thiết kế:** tầng này chỉ trả lời "có chuỗi tên nào xuất hiện không". Nó cố tình chấp nhận dương tính giả — ví dụ "Apple" trong câu về hoa quả — vì tầng 2 mới là nơi phán đoán ngữ cảnh. Đổi lại nó phải rất rẻ, nên chỉ dùng biểu thức chính quy, không gọi mạng.

- [ ] **Step 1: Tạo package `extraction`**

`packages/extraction/package.json`:

```json
{
  "name": "@geosuite/extraction",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -b" },
  "dependencies": { "@geosuite/shared": "workspace:*", "zod": "^3.23.8" }
}
```

`packages/extraction/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 2: Viết test thất bại**

`packages/extraction/src/candidates.test.ts`:

```ts
import { expect, it } from 'vitest'
import type { BrandProfile } from '@geosuite/shared'
import { findCandidates } from './candidates.js'

const brand: BrandProfile = {
  brandId: 'b1',
  name: 'Viettel',
  aliases: ['Viettel Telecom'],
  domains: ['viettel.vn'],
  entityDescription: 'Nhà mạng viễn thông Việt Nam',
  facts: [],
  competitors: [
    { id: 'c1', name: 'VinaPhone', aliases: ['Vinaphone'] },
    { id: 'c2', name: 'MobiFone', aliases: [] },
  ],
}

it('tìm thấy brand và đối thủ, sắp xếp theo vị trí xuất hiện', () => {
  const text = 'MobiFone và Viettel đều tốt, VinaPhone thì rẻ hơn.'
  expect(findCandidates(text, brand)).toEqual([
    { entityId: 'c2', entityName: 'MobiFone', offset: 0 },
    { entityId: 'b1', entityName: 'Viettel', offset: 12 },
    { entityId: 'c1', entityName: 'VinaPhone', offset: 29 },
  ])
})

it('khớp không phân biệt hoa thường', () => {
  const matches = findCandidates('vinaphone có gói cước tốt', brand)
  expect(matches.map((m) => m.entityId)).toEqual(['c1'])
})

it('chỉ giữ lần xuất hiện sớm nhất của mỗi thực thể', () => {
  const matches = findCandidates('Viettel Telecom mạnh. Viettel cũng vậy.', brand)
  expect(matches).toHaveLength(1)
  expect(matches[0]?.offset).toBe(0)
})

it('không khớp khi tên nằm bên trong một từ dài hơn', () => {
  const fruit: BrandProfile = { ...brand, brandId: 'b2', name: 'Apple', aliases: [], competitors: [] }
  expect(findCandidates('Applesauce rất ngon', fruit)).toEqual([])
})

it('vẫn coi là ứng viên khi tên đứng trong ngữ cảnh không liên quan', () => {
  const fruit: BrandProfile = { ...brand, brandId: 'b2', name: 'Apple', aliases: [], competitors: [] }
  expect(findCandidates('Apple là một loại trái cây', fruit)).toHaveLength(1)
})

it('trả về mảng rỗng khi không có tên nào xuất hiện', () => {
  expect(findCandidates('Không có nhà mạng nào được nhắc.', brand)).toEqual([])
})
```

- [ ] **Step 3: Chạy test để xác nhận thất bại**

```bash
pnpm install
pnpm vitest run packages/extraction
```

Kỳ vọng: FAIL với `Cannot find module './candidates.js'`.

- [ ] **Step 4: Viết `src/candidates.ts`**

```ts
import type { BrandProfile } from '@geosuite/shared'

export interface CandidateMatch {
  entityId: string
  entityName: string
  offset: number
}

interface Entity {
  id: string
  names: string[]
}

function normalize(value: string): string {
  return value.normalize('NFC').toLowerCase()
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function entitiesOf(brand: BrandProfile): Entity[] {
  return [
    { id: brand.brandId, names: [brand.name, ...brand.aliases] },
    ...brand.competitors.map((c) => ({ id: c.id, names: [c.name, ...c.aliases] })),
  ]
}

function earliestPerEntity(matches: CandidateMatch[]): CandidateMatch[] {
  const byEntity = new Map<string, CandidateMatch>()
  for (const match of matches) {
    const current = byEntity.get(match.entityId)
    if (current === undefined || match.offset < current.offset) {
      byEntity.set(match.entityId, match)
    }
  }
  return [...byEntity.values()].sort((a, b) => a.offset - b.offset)
}

export function findCandidates(text: string, brand: BrandProfile): CandidateMatch[] {
  const haystack = normalize(text)
  const matches: CandidateMatch[] = []

  for (const entity of entitiesOf(brand)) {
    for (const name of entity.names) {
      const needle = normalize(name.trim())
      if (needle.length === 0) continue
      const pattern = new RegExp(
        `(?<![\\p{L}\\p{N}])${escapeRegex(needle)}(?![\\p{L}\\p{N}])`,
        'gu',
      )
      for (const match of haystack.matchAll(pattern)) {
        matches.push({ entityId: entity.id, entityName: name, offset: match.index })
      }
    }
  }

  return earliestPerEntity(matches)
}
```

Lookaround dùng `\p{L}\p{N}` thay vì `\b` để hoạt động đúng với tiếng Việt có dấu.

- [ ] **Step 5: Chạy test để xác nhận thành công**

```bash
pnpm vitest run packages/extraction
```

Kỳ vọng: PASS, 6 test.

- [ ] **Step 6: Commit**

```bash
git add packages/extraction pnpm-lock.yaml
git commit -m "feat(extraction): tầng lọc ứng viên theo từ điển tên"
```

---

### Task 11: Extraction tầng 2 — xác nhận bằng LLM

**Files:**
- Create: `packages/extraction/src/confirm.ts`
- Test: `packages/extraction/src/confirm.test.ts`

**Interfaces:**
- Consumes: `CandidateMatch` (Task 10), `BrandProfile`, `AccuracyFlag`, `TokenUsage` từ `@geosuite/shared`, `tokenCost` từ `@geosuite/engines`
- Produces:
  - `ConfirmInput = { text: string; brand: BrandProfile; candidates: CandidateMatch[] }`
  - `ConfirmResult = { brandMentioned: boolean; brandPosition: number | null; sentiment: number | null; competitorIds: string[]; accuracyFlags: AccuracyFlag[]; usage: TokenUsage }`
  - `interface Confirmer { confirm(input: ConfirmInput): Promise<ConfirmResult> }`
  - `buildConfirmPrompt(input: ConfirmInput): string`
  - `confirmResultSchema` (zod)
  - `createLlmConfirmer(config: LlmConfirmerConfig): Confirmer`

- [ ] **Step 1: Thêm phụ thuộc**

Trong `packages/extraction/package.json`, thêm vào `dependencies`:

```json
"@geosuite/engines": "workspace:*"
```

Trong `packages/extraction/tsconfig.json`, thêm vào `references`:

```json
{ "path": "../engines" }
```

- [ ] **Step 2: Viết test thất bại**

`packages/extraction/src/confirm.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { BrandProfile } from '@geosuite/shared'
import { buildConfirmPrompt, createLlmConfirmer } from './confirm.js'
import { findCandidates } from './candidates.js'

const brand: BrandProfile = {
  brandId: 'b1',
  name: 'Viettel',
  aliases: ['Viettel Telecom'],
  domains: ['viettel.vn'],
  entityDescription: 'Nhà mạng viễn thông Việt Nam',
  facts: [{ id: 'f1', claim: 'Viettel có hơn 70 triệu thuê bao' }],
  competitors: [{ id: 'c1', name: 'VinaPhone', aliases: [] }],
}

const text = 'Viettel dẫn đầu với 40 triệu thuê bao. VinaPhone đứng thứ hai.'
const candidates = findCandidates(text, brand)

const payload = {
  brandMentioned: true,
  brandPosition: 1,
  sentiment: 0.5,
  competitorIds: ['c1'],
  accuracyFlags: [{ factId: 'f1', statedIncorrectly: 'Nói 40 triệu thuê bao thay vì hơn 70 triệu' }],
}

const server = setupServer(
  http.post('https://api.openai.test/v1/responses', () =>
    HttpResponse.json({
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(payload) }] }],
      usage: { input_tokens: 200, output_tokens: 60 },
    }),
  ),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function confirmer() {
  return createLlmConfirmer({
    apiKey: 'k',
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.test/v1',
    inputCostPerMTok: 0.15,
    outputCostPerMTok: 0.6,
  })
}

it('prompt chứa tên brand, biến thể, dữ kiện và danh sách ứng viên', () => {
  const prompt = buildConfirmPrompt({ text, brand, candidates })
  expect(prompt).toContain('Viettel')
  expect(prompt).toContain('Viettel Telecom')
  expect(prompt).toContain('Viettel có hơn 70 triệu thuê bao')
  expect(prompt).toContain('c1')
  expect(prompt).toContain(text)
})

it('phân tích phản hồi thành ConfirmResult kèm chi phí', async () => {
  const result = await confirmer().confirm({ text, brand, candidates })
  expect(result.brandMentioned).toBe(true)
  expect(result.brandPosition).toBe(1)
  expect(result.sentiment).toBe(0.5)
  expect(result.competitorIds).toEqual(['c1'])
  expect(result.accuracyFlags).toHaveLength(1)
  expect(result.usage.costUsd).toBeCloseTo(200 / 1e6 * 0.15 + 60 / 1e6 * 0.6, 9)
})

it('loại bỏ competitorId không thuộc hồ sơ brand', async () => {
  server.use(
    http.post('https://api.openai.test/v1/responses', () =>
      HttpResponse.json({
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({ ...payload, competitorIds: ['c1', 'khong-ton-tai'] }),
              },
            ],
          },
        ],
        usage: {},
      }),
    ),
  )
  const result = await confirmer().confirm({ text, brand, candidates })
  expect(result.competitorIds).toEqual(['c1'])
})

it('loại bỏ accuracyFlag trỏ tới factId không tồn tại', async () => {
  server.use(
    http.post('https://api.openai.test/v1/responses', () =>
      HttpResponse.json({
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  ...payload,
                  accuracyFlags: [{ factId: 'f9', statedIncorrectly: 'x' }],
                }),
              },
            ],
          },
        ],
        usage: {},
      }),
    ),
  )
  const result = await confirmer().confirm({ text, brand, candidates })
  expect(result.accuracyFlags).toEqual([])
})

it('ném lỗi khi phản hồi không đúng schema', async () => {
  server.use(
    http.post('https://api.openai.test/v1/responses', () =>
      HttpResponse.json({
        output: [{ type: 'message', content: [{ type: 'output_text', text: '{"brandMentioned":"có"}' }] }],
        usage: {},
      }),
    ),
  )
  await expect(confirmer().confirm({ text, brand, candidates })).rejects.toThrow(/schema/i)
})
```

- [ ] **Step 3: Chạy test để xác nhận thất bại**

```bash
pnpm vitest run packages/extraction/src/confirm.test.ts
```

Kỳ vọng: FAIL với `Cannot find module './confirm.js'`.

- [ ] **Step 4: Viết `src/confirm.ts`**

```ts
import { z } from 'zod'
import type { AccuracyFlag, BrandProfile, TokenUsage } from '@geosuite/shared'
import { tokenCost } from '@geosuite/engines'
import type { CandidateMatch } from './candidates.js'

export interface ConfirmInput {
  text: string
  brand: BrandProfile
  candidates: CandidateMatch[]
}

export interface ConfirmResult {
  brandMentioned: boolean
  brandPosition: number | null
  sentiment: number | null
  competitorIds: string[]
  accuracyFlags: AccuracyFlag[]
  usage: TokenUsage
}

export interface Confirmer {
  confirm(input: ConfirmInput): Promise<ConfirmResult>
}

export const confirmResultSchema = z.object({
  brandMentioned: z.boolean(),
  brandPosition: z.number().int().min(1).nullable(),
  sentiment: z.number().min(-1).max(1).nullable(),
  competitorIds: z.array(z.string()),
  accuracyFlags: z.array(z.object({ factId: z.string(), statedIncorrectly: z.string() })),
})

export function buildConfirmPrompt(input: ConfirmInput): string {
  const { brand, candidates, text } = input
  const aliases = brand.aliases.length > 0 ? brand.aliases.join(', ') : '(không có)'
  const facts =
    brand.facts.length > 0
      ? brand.facts.map((f) => `- ${f.id}: ${f.claim}`).join('\n')
      : '(không có dữ kiện nào)'
  const competitorList =
    brand.competitors.length > 0
      ? brand.competitors.map((c) => `- ${c.id}: ${c.name}`).join('\n')
      : '(không có đối thủ nào)'
  const candidateList =
    candidates.length > 0
      ? candidates.map((c) => `- ${c.entityId}: "${c.entityName}" tại vị trí ${c.offset}`).join('\n')
      : '(không có ứng viên nào)'

  return [
    'Bạn phân tích một câu trả lời do AI sinh ra, để xác định thương hiệu được nhắc đến như thế nào.',
    '',
    `Thương hiệu cần theo dõi: ${brand.name}`,
    `Các biến thể tên: ${aliases}`,
    `Mô tả: ${brand.entityDescription}`,
    '',
    'Đối thủ:',
    competitorList,
    '',
    'Dữ kiện đã được xác thực về thương hiệu:',
    facts,
    '',
    'Các chuỗi tên đã khớp sơ bộ (có thể là dương tính giả):',
    candidateList,
    '',
    'Câu trả lời cần phân tích:',
    '"""',
    text,
    '"""',
    '',
    'Quy tắc:',
    '- brandMentioned chỉ đúng khi tên chỉ đúng thực thể được mô tả ở trên, không phải một thứ trùng tên.',
    '- brandPosition là thứ tự xuất hiện của thương hiệu trong danh sách các thực thể được nhắc, bắt đầu từ 1. Trả null nếu không được nhắc.',
    '- sentiment là số thực từ -1 (rất tiêu cực) đến 1 (rất tích cực), tính riêng cho thương hiệu. Trả null nếu không được nhắc.',
    '- competitorIds chỉ chứa id trong danh sách đối thủ ở trên, và chỉ khi đối thủ đó thực sự được nhắc.',
    '- accuracyFlags chỉ liệt kê trường hợp câu trả lời mâu thuẫn với dữ kiện đã xác thực, kèm factId tương ứng.',
    '',
    'Trả về JSON đúng schema, không kèm giải thích.',
  ].join('\n')
}

export interface LlmConfirmerConfig {
  apiKey: string
  model: string
  baseUrl?: string
  inputCostPerMTok: number
  outputCostPerMTok: number
  fetchImpl?: typeof fetch
}

interface ResponseBody {
  output?: { content?: { type: string; text?: string }[] }[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

const jsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['brandMentioned', 'brandPosition', 'sentiment', 'competitorIds', 'accuracyFlags'],
  properties: {
    brandMentioned: { type: 'boolean' },
    brandPosition: { type: ['integer', 'null'] },
    sentiment: { type: ['number', 'null'] },
    competitorIds: { type: 'array', items: { type: 'string' } },
    accuracyFlags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['factId', 'statedIncorrectly'],
        properties: { factId: { type: 'string' }, statedIncorrectly: { type: 'string' } },
      },
    },
  },
} as const

export function createLlmConfirmer(config: LlmConfirmerConfig): Confirmer {
  const baseUrl = config.baseUrl ?? 'https://api.openai.com/v1'
  const doFetch = config.fetchImpl ?? fetch

  return {
    async confirm(input) {
      const response = await doFetch(`${baseUrl}/responses`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          input: buildConfirmPrompt(input),
          text: {
            format: { type: 'json_schema', name: 'confirm_result', strict: true, schema: jsonSchema },
          },
        }),
      })
      if (!response.ok) {
        throw new Error(`Xác nhận thất bại với mã ${response.status}: ${await response.text()}`)
      }
      const body = (await response.json()) as ResponseBody
      const raw = (body.output ?? [])
        .flatMap((item) => item.content ?? [])
        .find((content) => content.type === 'output_text')?.text
      if (raw === undefined) {
        throw new Error('Phản hồi xác nhận không chứa output_text')
      }

      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(raw)
      } catch {
        throw new Error('Phản hồi xác nhận không phải JSON hợp lệ')
      }

      const parsed = confirmResultSchema.safeParse(parsedJson)
      if (!parsed.success) {
        throw new Error(`Phản hồi xác nhận không khớp schema: ${parsed.error.message}`)
      }

      const knownCompetitors = new Set(input.brand.competitors.map((c) => c.id))
      const knownFacts = new Set(input.brand.facts.map((f) => f.id))
      const inputTokens = body.usage?.input_tokens ?? 0
      const outputTokens = body.usage?.output_tokens ?? 0

      return {
        brandMentioned: parsed.data.brandMentioned,
        brandPosition: parsed.data.brandMentioned ? parsed.data.brandPosition : null,
        sentiment: parsed.data.brandMentioned ? parsed.data.sentiment : null,
        competitorIds: parsed.data.competitorIds.filter((id) => knownCompetitors.has(id)),
        accuracyFlags: parsed.data.accuracyFlags.filter((flag) => knownFacts.has(flag.factId)),
        usage: {
          inputTokens,
          outputTokens,
          costUsd: tokenCost(inputTokens, outputTokens, config.inputCostPerMTok, config.outputCostPerMTok),
        },
      }
    },
  }
}
```

Việc lọc `competitorIds` và `accuracyFlags` theo hồ sơ là cần thiết: mô hình có thể bịa ra id, và nếu để lọt thì chỉ số Share of Voice và số cờ sai lệch sẽ bị thổi phồng.

- [ ] **Step 5: Chạy test để xác nhận thành công**

```bash
pnpm vitest run packages/extraction
```

Kỳ vọng: PASS, 11 test.

- [ ] **Step 6: Commit**

```bash
git add packages/extraction
git commit -m "feat(extraction): tầng xác nhận bằng LLM có structured output"
```

---

### Task 12: Ghép pipeline extraction

**Files:**
- Create: `packages/extraction/src/index.ts`
- Test: `packages/extraction/src/index.test.ts`

**Interfaces:**
- Consumes: `findCandidates` (Task 10), `Confirmer` (Task 11), `EngineResponse`, `Observation`, `Citation`, `BrandProfile` từ `@geosuite/shared`
- Produces:
  - `citesOwnDomain(citations: Citation[], domains: string[]): boolean`
  - `ExtractionResult = { observation: Observation; usage: TokenUsage }`
  - `extract(response: EngineResponse, brand: BrandProfile, confirmer: Confirmer): Promise<ExtractionResult>`

**Ghi chú thiết kế:** khi tầng 1 không tìm thấy ứng viên nào, pipeline bỏ qua tầng 2 hoàn toàn. Đây chính là cơ chế giữ chi phí ở mức chấp nhận được đã nêu trong spec, nên nó có một test riêng dùng confirmer luôn ném lỗi.

- [ ] **Step 1: Viết test thất bại**

`packages/extraction/src/index.test.ts`:

```ts
import { expect, it, vi } from 'vitest'
import type { BrandProfile, EngineResponse } from '@geosuite/shared'
import { citesOwnDomain, extract } from './index.js'
import type { Confirmer } from './confirm.js'

const brand: BrandProfile = {
  brandId: 'b1',
  name: 'Viettel',
  aliases: [],
  domains: ['viettel.vn'],
  entityDescription: 'Nhà mạng',
  facts: [],
  competitors: [{ id: 'c1', name: 'VinaPhone', aliases: [] }],
}

function response(overrides: Partial<EngineResponse> = {}): EngineResponse {
  return {
    engineId: 'openai',
    model: 'gpt-4o',
    text: 'Viettel dẫn đầu.',
    citations: [{ url: 'https://www.viettel.vn/goi-cuoc', title: null, position: 1 }],
    latencyMs: 100,
    usage: { inputTokens: 10, outputTokens: 10, costUsd: 0.001 },
    ...overrides,
  }
}

const confirmer: Confirmer = {
  confirm: async () => ({
    brandMentioned: true,
    brandPosition: 1,
    sentiment: 0.8,
    competitorIds: ['c1'],
    accuracyFlags: [],
    usage: { inputTokens: 200, outputTokens: 50, costUsd: 0.002 },
  }),
}

it('nhận diện citation thuộc domain của brand kể cả khi có www hoặc subdomain', () => {
  expect(citesOwnDomain([{ url: 'https://www.viettel.vn/a', title: null, position: 1 }], ['viettel.vn'])).toBe(true)
  expect(citesOwnDomain([{ url: 'https://shop.viettel.vn/a', title: null, position: 1 }], ['viettel.vn'])).toBe(true)
  expect(citesOwnDomain([{ url: 'https://viettel.vn.evil.com/', title: null, position: 1 }], ['viettel.vn'])).toBe(false)
  expect(citesOwnDomain([], ['viettel.vn'])).toBe(false)
})

it('ghép kết quả hai tầng thành một Observation', async () => {
  const result = await extract(response(), brand, confirmer)
  expect(result.observation).toEqual({
    mentioned: true,
    position: 1,
    sentiment: 0.8,
    citedOwnDomain: true,
    competitorIds: ['c1'],
    accuracyFlags: [],
  })
  expect(result.usage.costUsd).toBeCloseTo(0.002, 9)
})

it('bỏ qua tầng 2 khi không có ứng viên nào', async () => {
  const spy = vi.fn()
  const never: Confirmer = { confirm: spy }
  const result = await extract(
    response({ text: 'Không nhắc nhà mạng nào cả.', citations: [] }),
    brand,
    never,
  )
  expect(spy).not.toHaveBeenCalled()
  expect(result.observation).toEqual({
    mentioned: false,
    position: null,
    sentiment: null,
    citedOwnDomain: false,
    competitorIds: [],
    accuracyFlags: [],
  })
  expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0, costUsd: 0 })
})

it('vẫn ghi nhận citedOwnDomain khi tầng 2 kết luận không được nhắc', async () => {
  const rejecting: Confirmer = {
    confirm: async () => ({
      brandMentioned: false,
      brandPosition: null,
      sentiment: null,
      competitorIds: [],
      accuracyFlags: [],
      usage: { inputTokens: 100, outputTokens: 10, costUsd: 0.0005 },
    }),
  }
  const result = await extract(response(), brand, rejecting)
  expect(result.observation.mentioned).toBe(false)
  expect(result.observation.citedOwnDomain).toBe(true)
})
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

```bash
pnpm vitest run packages/extraction/src/index.test.ts
```

Kỳ vọng: FAIL với `Cannot find module './index.js'`.

- [ ] **Step 3: Viết `src/index.ts`**

```ts
import type { BrandProfile, Citation, EngineResponse, Observation, TokenUsage } from '@geosuite/shared'
import { findCandidates } from './candidates.js'
import type { Confirmer } from './confirm.js'

export * from './candidates.js'
export * from './confirm.js'

const zeroUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 }

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

export function citesOwnDomain(citations: Citation[], domains: string[]): boolean {
  return citations.some((citation) => {
    const host = hostnameOf(citation.url)
    if (host === '') return false
    return domains.some((raw) => {
      const domain = raw.replace(/^www\./, '').toLowerCase()
      return host === domain || host.endsWith(`.${domain}`)
    })
  })
}

export interface ExtractionResult {
  observation: Observation
  usage: TokenUsage
}

export async function extract(
  response: EngineResponse,
  brand: BrandProfile,
  confirmer: Confirmer,
): Promise<ExtractionResult> {
  const citedOwnDomain = citesOwnDomain(response.citations, brand.domains)
  const candidates = findCandidates(response.text, brand)

  if (candidates.length === 0) {
    return {
      observation: {
        mentioned: false,
        position: null,
        sentiment: null,
        citedOwnDomain,
        competitorIds: [],
        accuracyFlags: [],
      },
      usage: zeroUsage,
    }
  }

  const confirmed = await confirmer.confirm({ text: response.text, brand, candidates })

  return {
    observation: {
      mentioned: confirmed.brandMentioned,
      position: confirmed.brandPosition,
      sentiment: confirmed.sentiment,
      citedOwnDomain,
      competitorIds: confirmed.competitorIds,
      accuracyFlags: confirmed.accuracyFlags,
    },
    usage: confirmed.usage,
  }
}
```

`citedOwnDomain` tính từ citation chứ không từ văn bản, nên nó độc lập với kết luận của tầng 2 — một câu trả lời có thể dẫn link về website mà không gọi tên thương hiệu.

- [ ] **Step 4: Chạy test để xác nhận thành công**

```bash
pnpm vitest run packages/extraction
```

Kỳ vọng: PASS, 15 test.

- [ ] **Step 5: Commit**

```bash
git add packages/extraction/src
git commit -m "feat(extraction): ghép pipeline hai tầng"
```

---

### Task 13: Tính 6 chỉ số

**Files:**
- Create: `packages/scoring/package.json`, `packages/scoring/tsconfig.json`
- Create: `packages/scoring/src/index.ts`
- Test: `packages/scoring/src/index.test.ts`

**Interfaces:**
- Consumes: `ObservationRow` từ `@geosuite/shared`
- Produces:
  - `MetricSet = { visibilityRate: number; shareOfVoice: number; citationRate: number; averagePosition: number | null; sentimentScore: number | null; accuracyFlagCount: number }`
  - `computeMetrics(rows: ObservationRow[]): MetricSet`

**Định nghĩa chỉ số** (khớp bảng trong spec, mục 5):

| Chỉ số | Công thức | Khi không có dữ liệu |
|---|---|---|
| `visibilityRate` | số quan sát `mentioned` chia tổng số quan sát | `0` |
| `shareOfVoice` | số lần nhắc brand chia (số lần nhắc brand + tổng số lần nhắc đối thủ) | `0` |
| `citationRate` | số quan sát `citedOwnDomain` chia tổng số quan sát | `0` |
| `averagePosition` | trung bình `position` trên các quan sát có `position` khác null | `null` |
| `sentimentScore` | trung bình `sentiment` trên các quan sát có `sentiment` khác null | `null` |
| `accuracyFlagCount` | tổng số phần tử `accuracyFlags` | `0` |

- [ ] **Step 1: Tạo package `scoring`**

`packages/scoring/package.json`:

```json
{
  "name": "@geosuite/scoring",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -b" },
  "dependencies": { "@geosuite/shared": "workspace:*" }
}
```

`packages/scoring/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 2: Viết test thất bại**

`packages/scoring/src/index.test.ts`:

```ts
import { expect, it } from 'vitest'
import type { ObservationRow } from '@geosuite/shared'
import { computeMetrics } from './index.js'

function row(overrides: Partial<ObservationRow> = {}): ObservationRow {
  return {
    promptId: 'p1',
    engineId: 'openai',
    mentioned: false,
    position: null,
    sentiment: null,
    citedOwnDomain: false,
    competitorIds: [],
    accuracyFlags: [],
    ...overrides,
  }
}

it('trả về giá trị trung tính khi không có quan sát nào', () => {
  expect(computeMetrics([])).toEqual({
    visibilityRate: 0,
    shareOfVoice: 0,
    citationRate: 0,
    averagePosition: null,
    sentimentScore: null,
    accuracyFlagCount: 0,
  })
})

it('tính visibilityRate và citationRate trên tổng số quan sát', () => {
  const metrics = computeMetrics([
    row({ mentioned: true, citedOwnDomain: true }),
    row({ mentioned: true, citedOwnDomain: false }),
    row(),
    row(),
  ])
  expect(metrics.visibilityRate).toBe(0.5)
  expect(metrics.citationRate).toBe(0.25)
})

it('tính shareOfVoice trên tổng lần nhắc của brand và đối thủ', () => {
  const metrics = computeMetrics([
    row({ mentioned: true, competitorIds: ['c1'] }),
    row({ mentioned: true, competitorIds: ['c1', 'c2'] }),
  ])
  expect(metrics.shareOfVoice).toBeCloseTo(2 / 5, 9)
})

it('shareOfVoice bằng 0 khi không ai được nhắc', () => {
  expect(computeMetrics([row(), row()]).shareOfVoice).toBe(0)
})

it('bỏ qua giá trị null khi tính trung bình vị trí và sắc thái', () => {
  const metrics = computeMetrics([
    row({ mentioned: true, position: 1, sentiment: 0.4 }),
    row({ mentioned: true, position: 3, sentiment: null }),
    row(),
  ])
  expect(metrics.averagePosition).toBe(2)
  expect(metrics.sentimentScore).toBeCloseTo(0.4, 9)
})

it('cộng dồn số cờ sai lệch trên mọi quan sát', () => {
  const metrics = computeMetrics([
    row({ mentioned: true, accuracyFlags: [{ factId: 'f1', statedIncorrectly: 'a' }] }),
    row({
      mentioned: true,
      accuracyFlags: [
        { factId: 'f1', statedIncorrectly: 'b' },
        { factId: 'f2', statedIncorrectly: 'c' },
      ],
    }),
  ])
  expect(metrics.accuracyFlagCount).toBe(3)
})
```

- [ ] **Step 3: Chạy test để xác nhận thất bại**

```bash
pnpm install
pnpm vitest run packages/scoring
```

Kỳ vọng: FAIL với `Cannot find module './index.js'`.

- [ ] **Step 4: Viết `src/index.ts`**

```ts
import type { ObservationRow } from '@geosuite/shared'

export interface MetricSet {
  visibilityRate: number
  shareOfVoice: number
  citationRate: number
  averagePosition: number | null
  sentimentScore: number | null
  accuracyFlagCount: number
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

export function computeMetrics(rows: ObservationRow[]): MetricSet {
  const total = rows.length
  const brandMentions = rows.filter((r) => r.mentioned).length
  const competitorMentions = rows.reduce((sum, r) => sum + r.competitorIds.length, 0)

  return {
    visibilityRate: ratio(brandMentions, total),
    shareOfVoice: ratio(brandMentions, brandMentions + competitorMentions),
    citationRate: ratio(rows.filter((r) => r.citedOwnDomain).length, total),
    averagePosition: mean(
      rows.map((r) => r.position).filter((p): p is number => p !== null),
    ),
    sentimentScore: mean(
      rows.map((r) => r.sentiment).filter((s): s is number => s !== null),
    ),
    accuracyFlagCount: rows.reduce((sum, r) => sum + r.accuracyFlags.length, 0),
  }
}
```

- [ ] **Step 5: Chạy test để xác nhận thành công**

```bash
pnpm vitest run packages/scoring
```

Kỳ vọng: PASS, 6 test.

- [ ] **Step 6: Commit**

```bash
git add packages/scoring pnpm-lock.yaml
git commit -m "feat(scoring): tính 6 chỉ số hiển thị"
```

---

### Task 14: Throttle và ngân sách

**Files:**
- Create: `packages/probe-engine/package.json`, `packages/probe-engine/tsconfig.json`
- Create: `packages/probe-engine/src/throttle.ts`, `src/budget.ts`
- Create: `packages/probe-engine/src/testing/redis.ts`
- Test: `packages/probe-engine/src/throttle.test.ts`, `src/budget.test.ts`

**Interfaces:**
- Consumes: `OrganizationRepository`, `UsageRepository` từ `@geosuite/db`
- Produces:
  - `RateLimit = { capacity: number; refillPerSecond: number }`
  - `interface Throttle { acquire(key: string): Promise<void> }`
  - `createRedisThrottle(redis: Redis, limits: Record<string, RateLimit>, options?: { now?: () => number; sleep?: (ms: number) => Promise<void> }): Throttle`
  - `BudgetStatus = { allowed: boolean; spentUsd: number; limitUsd: number }`
  - `interface BudgetGuard { check(orgId: string): Promise<BudgetStatus> }`
  - `createBudgetGuard(deps: { organizations: OrganizationRepository; usage: UsageRepository }): BudgetGuard`
  - `class BudgetExceededError extends Error`
  - `startRedis(): Promise<RedisHandle>` với `RedisHandle = { url: string; stop(): Promise<void> }`

- [ ] **Step 1: Tạo package `probe-engine`**

`packages/probe-engine/package.json`:

```json
{
  "name": "@geosuite/probe-engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -b" },
  "dependencies": {
    "@geosuite/db": "workspace:*",
    "@geosuite/engines": "workspace:*",
    "@geosuite/extraction": "workspace:*",
    "@geosuite/scoring": "workspace:*",
    "@geosuite/shared": "workspace:*",
    "ioredis": "^5.4.1"
  },
  "devDependencies": { "@testcontainers/redis": "^10.13.2" }
}
```

`packages/probe-engine/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"],
  "references": [
    { "path": "../shared" },
    { "path": "../db" },
    { "path": "../engines" },
    { "path": "../extraction" },
    { "path": "../scoring" }
  ]
}
```

- [ ] **Step 2: Viết helper Redis cho test**

`packages/probe-engine/src/testing/redis.ts`:

```ts
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis'

export interface RedisHandle {
  url: string
  stop(): Promise<void>
}

export async function startRedis(): Promise<RedisHandle> {
  const container: StartedRedisContainer = await new RedisContainer('redis:7-alpine').start()
  return {
    url: container.getConnectionUrl(),
    async stop() {
      await container.stop()
    },
  }
}
```

- [ ] **Step 3: Viết test thất bại cho throttle**

`packages/probe-engine/src/throttle.test.ts`:

```ts
import { afterAll, beforeAll, expect, it } from 'vitest'
import Redis from 'ioredis'
import { startRedis, type RedisHandle } from './testing/redis.js'
import { createRedisThrottle } from './throttle.js'

let handle: RedisHandle
let redis: Redis

beforeAll(async () => {
  handle = await startRedis()
  redis = new Redis(handle.url)
})

afterAll(async () => {
  await redis?.quit()
  await handle?.stop()
})

it('cho phép lấy token đến hết dung lượng mà không phải chờ', async () => {
  const slept: number[] = []
  const throttle = createRedisThrottle(
    redis,
    { openai: { capacity: 3, refillPerSecond: 1 } },
    { now: () => 1_000, sleep: async (ms) => void slept.push(ms) },
  )
  await throttle.acquire('openai')
  await throttle.acquire('openai')
  await throttle.acquire('openai')
  expect(slept).toEqual([])
})

it('bắt chờ khi đã cạn token, rồi cho qua sau khi thời gian trôi', async () => {
  const slept: number[] = []
  let clock = 5_000
  const throttle = createRedisThrottle(
    redis,
    { gemini: { capacity: 1, refillPerSecond: 2 } },
    {
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms)
        clock += ms
      },
    },
  )
  await throttle.acquire('gemini')
  await throttle.acquire('gemini')
  expect(slept).toHaveLength(1)
  expect(slept[0]).toBeGreaterThan(0)
  expect(slept[0]).toBeLessThanOrEqual(500)
})

it('các key khác nhau có bucket độc lập', async () => {
  const slept: number[] = []
  const throttle = createRedisThrottle(
    redis,
    { a: { capacity: 1, refillPerSecond: 1 }, b: { capacity: 1, refillPerSecond: 1 } },
    { now: () => 9_000, sleep: async (ms) => void slept.push(ms) },
  )
  await throttle.acquire('a')
  await throttle.acquire('b')
  expect(slept).toEqual([])
})

it('ném lỗi khi key chưa được cấu hình giới hạn', async () => {
  const throttle = createRedisThrottle(redis, {}, { now: () => 0 })
  await expect(throttle.acquire('chua-cau-hinh')).rejects.toThrow(/chưa cấu hình/i)
})
```

- [ ] **Step 4: Chạy test để xác nhận thất bại**

```bash
pnpm install
pnpm vitest run packages/probe-engine/src/throttle.test.ts
```

Kỳ vọng: FAIL với `Cannot find module './throttle.js'`.

- [ ] **Step 5: Viết `src/throttle.ts`**

```ts
import type Redis from 'ioredis'

export interface RateLimit {
  capacity: number
  refillPerSecond: number
}

export interface Throttle {
  acquire(key: string): Promise<void>
}

export interface ThrottleOptions {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  maxAttempts?: number
}

const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local state = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts = tonumber(state[2])
if tokens == nil or ts == nil then
  tokens = capacity
  ts = now
end
local elapsed = math.max(0, now - ts) / 1000
tokens = math.min(capacity, tokens + elapsed * refill)
local wait = 0
if tokens >= 1 then
  tokens = tokens - 1
else
  wait = math.ceil((1 - tokens) / refill * 1000)
end
redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, 300000)
return wait
`

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export function createRedisThrottle(
  redis: Redis,
  limits: Record<string, RateLimit>,
  options: ThrottleOptions = {},
): Throttle {
  const now = options.now ?? (() => Date.now())
  const sleep = options.sleep ?? defaultSleep
  const maxAttempts = options.maxAttempts ?? 20

  return {
    async acquire(key) {
      const limit = limits[key]
      if (limit === undefined) {
        throw new Error(`Khoá giới hạn "${key}" chưa cấu hình`)
      }
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const wait = Number(
          await redis.eval(
            TOKEN_BUCKET_LUA,
            1,
            `throttle:${key}`,
            String(limit.capacity),
            String(limit.refillPerSecond),
            String(now()),
          ),
        )
        if (wait === 0) return
        await sleep(wait)
      }
      throw new Error(`Không lấy được token cho "${key}" sau ${maxAttempts} lần thử`)
    },
  }
}
```

Thời gian được truyền vào script bằng `ARGV` thay vì gọi `TIME` bên trong Lua, để script vẫn tất định và test kiểm soát được đồng hồ.

- [ ] **Step 6: Viết test thất bại cho ngân sách**

`packages/probe-engine/src/budget.test.ts`:

```ts
import { expect, it } from 'vitest'
import { BudgetExceededError, createBudgetGuard } from './budget.js'

function guard(spent: number, limit: number) {
  return createBudgetGuard({
    organizations: {
      getSettings: async () => ({ monthlyBudgetUsd: limit, sharedCacheEnabled: true }),
      listAll: async () => [],
    },
    usage: { record: async () => {}, spentThisMonth: async () => spent },
  })
}

it('cho phép khi chi tiêu còn dưới hạn mức', async () => {
  expect(await guard(40, 100).check('org-1')).toEqual({ allowed: true, spentUsd: 40, limitUsd: 100 })
})

it('chặn khi chi tiêu chạm đúng hạn mức', async () => {
  expect((await guard(100, 100).check('org-1')).allowed).toBe(false)
})

it('chặn khi chi tiêu vượt hạn mức', async () => {
  expect((await guard(101, 100).check('org-1')).allowed).toBe(false)
})

it('BudgetExceededError mang theo số đã tiêu và hạn mức', () => {
  const error = new BudgetExceededError('org-1', 120, 100)
  expect(error.orgId).toBe('org-1')
  expect(error.spentUsd).toBe(120)
  expect(error.limitUsd).toBe(100)
  expect(error.message).toContain('org-1')
})
```

- [ ] **Step 7: Viết `src/budget.ts`**

```ts
import type { OrganizationRepository, UsageRepository } from '@geosuite/db'

export interface BudgetStatus {
  allowed: boolean
  spentUsd: number
  limitUsd: number
}

export interface BudgetGuard {
  check(orgId: string): Promise<BudgetStatus>
}

export class BudgetExceededError extends Error {
  constructor(
    readonly orgId: string,
    readonly spentUsd: number,
    readonly limitUsd: number,
  ) {
    super(`Org ${orgId} đã dùng ${spentUsd.toFixed(2)} USD, vượt hạn mức ${limitUsd.toFixed(2)} USD`)
    this.name = 'BudgetExceededError'
  }
}

export interface BudgetGuardDeps {
  organizations: OrganizationRepository
  usage: UsageRepository
}

export function createBudgetGuard(deps: BudgetGuardDeps): BudgetGuard {
  return {
    async check(orgId) {
      const [settings, spentUsd] = await Promise.all([
        deps.organizations.getSettings(orgId),
        deps.usage.spentThisMonth(orgId),
      ])
      const limitUsd = settings.monthlyBudgetUsd
      return { allowed: spentUsd < limitUsd, spentUsd, limitUsd }
    },
  }
}
```

- [ ] **Step 8: Chạy test để xác nhận thành công**

```bash
pnpm vitest run packages/probe-engine
```

Kỳ vọng: PASS, 8 test.

- [ ] **Step 9: Commit**

```bash
git add packages/probe-engine pnpm-lock.yaml
git commit -m "feat(probe-engine): token bucket và kiểm tra hạn mức chi tiêu"
```

---

### Task 15: Cache câu trả lời dùng chung

**Files:**
- Create: `packages/probe-engine/src/cache.ts`
- Test: `packages/probe-engine/src/cache.test.ts`

**Interfaces:**
- Consumes: `EngineResponse`, `engineResponseSchema`, `EngineId` từ `@geosuite/shared`, `startRedis` (Task 14)
- Produces:
  - `CacheKeyInput = { prompt: string; engineId: EngineId; model: string; locale: string; day: string }`
  - `responseCacheKey(input: CacheKeyInput): string`
  - `interface ResponseCache { get(key: string): Promise<EngineResponse | null>; set(key: string, value: EngineResponse, ttlSeconds: number): Promise<void> }`
  - `createRedisResponseCache(redis: Redis): ResponseCache`

**Ghi chú thiết kế:** đây là cơ chế tiết kiệm chi phí đã nêu ở mục 8 của spec — nhiều tenant theo dõi cùng một câu hỏi chỉ tốn một lệnh gọi. Khoá cache cố tình không chứa `orgId` hay `brandId`: nó băm nội dung câu hỏi, chứ không băm ai hỏi. `extraction` vẫn chạy riêng cho từng brand nên kết quả đo không bị trộn lẫn.

Khi đọc, giá trị được kiểm tra lại bằng `engineResponseSchema`. Nếu không khớp — do đổi định dạng giữa các phiên bản — cache coi như miss thay vì ném lỗi, để một thay đổi schema không làm sập toàn bộ probe.

- [ ] **Step 1: Viết test thất bại**

`packages/probe-engine/src/cache.test.ts`:

```ts
import { afterAll, beforeAll, expect, it } from 'vitest'
import Redis from 'ioredis'
import type { EngineResponse } from '@geosuite/shared'
import { startRedis, type RedisHandle } from './testing/redis.js'
import { createRedisResponseCache, responseCacheKey } from './cache.js'

let handle: RedisHandle
let redis: Redis

const response: EngineResponse = {
  engineId: 'openai',
  model: 'gpt-4o',
  text: 'Viettel dẫn đầu.',
  citations: [{ url: 'https://viettel.vn/', title: 'Viettel', position: 1 }],
  latencyMs: 900,
  usage: { inputTokens: 10, outputTokens: 20, costUsd: 0.001 },
}

beforeAll(async () => {
  handle = await startRedis()
  redis = new Redis(handle.url)
})

afterAll(async () => {
  await redis?.quit()
  await handle?.stop()
})

const base = { prompt: 'Nhà mạng nào tốt nhất?', engineId: 'openai', model: 'gpt-4o', locale: 'vi-VN', day: '2026-08-06' } as const

it('sinh cùng một khoá cho cùng bộ đầu vào', () => {
  expect(responseCacheKey(base)).toBe(responseCacheKey({ ...base }))
})

it('đổi bất kỳ thành phần nào cũng đổi khoá', () => {
  const key = responseCacheKey(base)
  expect(responseCacheKey({ ...base, prompt: 'Câu khác' })).not.toBe(key)
  expect(responseCacheKey({ ...base, engineId: 'gemini' })).not.toBe(key)
  expect(responseCacheKey({ ...base, model: 'gpt-4o-mini' })).not.toBe(key)
  expect(responseCacheKey({ ...base, locale: 'en-US' })).not.toBe(key)
  expect(responseCacheKey({ ...base, day: '2026-08-07' })).not.toBe(key)
})

it('khoá không chứa thông tin nhận dạng tenant', () => {
  expect(responseCacheKey(base)).toMatch(/^resp:[0-9a-f]{64}$/)
})

it('ghi rồi đọc lại trả về đúng phản hồi', async () => {
  const cache = createRedisResponseCache(redis)
  const key = responseCacheKey(base)
  expect(await cache.get(key)).toBeNull()
  await cache.set(key, response, 60)
  expect(await cache.get(key)).toEqual(response)
})

it('coi như miss khi giá trị lưu không khớp schema', async () => {
  const cache = createRedisResponseCache(redis)
  await redis.set('resp:hong', JSON.stringify({ engineId: 'openai' }))
  expect(await cache.get('resp:hong')).toBeNull()
})

it('coi như miss khi giá trị lưu không phải JSON', async () => {
  const cache = createRedisResponseCache(redis)
  await redis.set('resp:rac', 'khong-phai-json')
  expect(await cache.get('resp:rac')).toBeNull()
})
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

```bash
pnpm vitest run packages/probe-engine/src/cache.test.ts
```

Kỳ vọng: FAIL với `Cannot find module './cache.js'`.

- [ ] **Step 3: Viết `src/cache.ts`**

```ts
import { createHash } from 'node:crypto'
import type Redis from 'ioredis'
import { engineResponseSchema, type EngineId, type EngineResponse } from '@geosuite/shared'

export interface CacheKeyInput {
  prompt: string
  engineId: EngineId
  model: string
  locale: string
  day: string
}

export function responseCacheKey(input: CacheKeyInput): string {
  const material = [input.prompt.trim(), input.engineId, input.model, input.locale, input.day].join(' ')
  return `resp:${createHash('sha256').update(material, 'utf8').digest('hex')}`
}

export interface ResponseCache {
  get(key: string): Promise<EngineResponse | null>
  set(key: string, value: EngineResponse, ttlSeconds: number): Promise<void>
}

export function createRedisResponseCache(redis: Redis): ResponseCache {
  return {
    async get(key) {
      const raw = await redis.get(key)
      if (raw === null) return null

      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(raw)
      } catch {
        return null
      }

      const parsed = engineResponseSchema.safeParse(parsedJson)
      return parsed.success ? parsed.data : null
    },
    async set(key, value, ttlSeconds) {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
    },
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận thành công**

```bash
pnpm vitest run packages/probe-engine
```

Kỳ vọng: PASS, 14 test.

- [ ] **Step 5: Commit**

```bash
git add packages/probe-engine/src
git commit -m "feat(probe-engine): cache câu trả lời thô dùng chung giữa tenant"
```

---

### Task 16: Điều phối probe và độ phủ

**Files:**
- Create: `packages/probe-engine/src/run.ts`, `src/index.ts`
- Test: `packages/probe-engine/src/run.test.ts`

**Interfaces:**
- Consumes: `Throttle`, `BudgetGuard`, `BudgetExceededError` (Task 14), `ResponseCache`, `responseCacheKey` (Task 15), `extract`, `Confirmer` (Task 12), `computeMetrics` (Task 13), repository (Task 4, 5), `Engine` (Task 6)
- Produces:
  - `ProbeJob = { orgId; brandId; runId; promptId; promptText; engineId; locale; day }`
  - `ProbeDeps = { engines: Map<EngineId, Engine>; cache: ResponseCache; throttle: Throttle; budget: BudgetGuard; confirmer: Confirmer; repos: ProbeRepos; cacheTtlSeconds: number }`
  - `ProbeRepos = { organizations; brands; probeRuns; probeResults; observations; dailyMetrics; usage }`
  - `executeProbeJob(job: ProbeJob, deps: ProbeDeps): Promise<void>`
  - `finalizeRun(input: FinalizeInput, deps: ProbeDeps): Promise<RunSummary>` với `FinalizeInput = { orgId; brandId; runId; day; totalJobs; succeededJobs }` và `RunSummary = { coverage: number; metrics: MetricSet }`

**Ghi chú thiết kế:** `executeProbeJob` không tự ghi nhận thất bại. Nó ném lỗi ra ngoài để hàng đợi retry, và chỉ khi hết lượt retry thì worker (Task 17) mới gọi `probeRuns.markJob(..., 'failed')`. Nếu ghi ngay trong hàm này thì mỗi lần retry sẽ cộng thêm một lần hỏng và độ phủ sẽ sai.

- [ ] **Step 1: Viết test thất bại**

`packages/probe-engine/src/run.test.ts`:

```ts
import { expect, it, vi } from 'vitest'
import type { BrandProfile, Engine, EngineResponse } from '@geosuite/shared'
import { EngineError } from '@geosuite/engines'
import { BudgetExceededError } from './budget.js'
import { executeProbeJob, finalizeRun, type ProbeDeps, type ProbeJob } from './run.js'

const brand: BrandProfile = {
  brandId: 'brand-1',
  name: 'Viettel',
  aliases: [],
  domains: ['viettel.vn'],
  entityDescription: 'Nhà mạng',
  facts: [],
  competitors: [{ id: 'c1', name: 'VinaPhone', aliases: [] }],
}

const engineResponse: EngineResponse = {
  engineId: 'openai',
  model: 'gpt-4o',
  text: 'Viettel dẫn đầu, VinaPhone theo sau.',
  citations: [{ url: 'https://viettel.vn/a', title: null, position: 1 }],
  latencyMs: 800,
  usage: { inputTokens: 100, outputTokens: 200, costUsd: 0.005 },
}

const job: ProbeJob = {
  orgId: 'org-1',
  brandId: 'brand-1',
  runId: 'run-1',
  promptId: 'prompt-1',
  promptText: 'Nhà mạng nào tốt nhất?',
  engineId: 'openai',
  locale: 'vi-VN',
  day: '2026-08-06',
}

function makeDeps(overrides: Partial<ProbeDeps> = {}) {
  const store = new Map<string, EngineResponse>()
  const calls = {
    engineRun: vi.fn(async () => engineResponse),
    resultInsert: vi.fn(async () => 'result-1'),
    observationInsert: vi.fn(async () => {}),
    usageRecord: vi.fn(async () => {}),
    markJob: vi.fn(async () => {}),
    acquire: vi.fn(async () => {}),
  }
  const engine: Engine = { id: 'openai', run: calls.engineRun }
  const deps: ProbeDeps = {
    engines: new Map([['openai', engine]]),
    cache: {
      get: async (key) => store.get(key) ?? null,
      set: async (key, value) => void store.set(key, value),
    },
    throttle: { acquire: calls.acquire },
    budget: { check: async () => ({ allowed: true, spentUsd: 1, limitUsd: 100 }) },
    confirmer: {
      confirm: async () => ({
        brandMentioned: true,
        brandPosition: 1,
        sentiment: 0.5,
        competitorIds: ['c1'],
        accuracyFlags: [],
        usage: { inputTokens: 50, outputTokens: 20, costUsd: 0.0006 },
      }),
    },
    cacheTtlSeconds: 3600,
    repos: {
      organizations: {
        getSettings: async () => ({ monthlyBudgetUsd: 100, sharedCacheEnabled: true }),
        listAll: async () => [{ id: 'org-1' }],
      },
      brands: { getProfile: async () => brand, listByOrg: async () => [{ id: 'brand-1', name: 'Viettel' }] },
      probeRuns: { create: async () => 'run-1', markJob: calls.markJob, complete: async () => {} },
      probeResults: { insert: calls.resultInsert },
      observations: { insert: calls.observationInsert, listByRun: async () => [] },
      dailyMetrics: { upsert: async () => {} },
      usage: { record: calls.usageRecord, spentThisMonth: async () => 1 },
    },
    ...overrides,
  }
  return { deps, calls, store }
}

it('chạy trọn một job: gọi engine, lưu kết quả, ghi quan sát và chi phí', async () => {
  const { deps, calls } = makeDeps()
  await executeProbeJob(job, deps)

  expect(calls.acquire).toHaveBeenCalledWith('openai')
  expect(calls.engineRun).toHaveBeenCalledTimes(1)
  expect(calls.resultInsert).toHaveBeenCalledWith('org-1', expect.objectContaining({
    runId: 'run-1', promptId: 'prompt-1', engineId: 'openai', cacheHit: false, ownDomains: ['viettel.vn'],
  }))
  expect(calls.observationInsert).toHaveBeenCalledWith('org-1', expect.objectContaining({
    mentioned: true, position: 1, citedOwnDomain: true, competitorIds: ['c1'],
  }))
  expect(calls.usageRecord).toHaveBeenCalledTimes(2)
  expect(calls.markJob).toHaveBeenCalledWith('org-1', 'run-1', 'succeeded')
})

it('lần chạy thứ hai dùng lại cache và không gọi engine', async () => {
  const { deps, calls } = makeDeps()
  await executeProbeJob(job, deps)
  await executeProbeJob({ ...job, promptId: 'prompt-2' }, deps)

  expect(calls.engineRun).toHaveBeenCalledTimes(1)
  expect(calls.resultInsert).toHaveBeenLastCalledWith('org-1', expect.objectContaining({ cacheHit: true }))
})

it('không ghi chi phí probe khi lấy được từ cache', async () => {
  const { deps, calls } = makeDeps()
  await executeProbeJob(job, deps)
  calls.usageRecord.mockClear()
  await executeProbeJob({ ...job, promptId: 'prompt-2' }, deps)

  const purposes = calls.usageRecord.mock.calls.map((c) => (c[1] as { purpose: string }).purpose)
  expect(purposes).toEqual(['extraction'])
})

it('bỏ qua cache khi org tắt tính năng dùng chung', async () => {
  const { deps, calls } = makeDeps()
  deps.repos.organizations.getSettings = async () => ({ monthlyBudgetUsd: 100, sharedCacheEnabled: false })
  await executeProbeJob(job, deps)
  await executeProbeJob({ ...job, promptId: 'prompt-2' }, deps)

  expect(calls.engineRun).toHaveBeenCalledTimes(2)
})

it('ném BudgetExceededError và không gọi engine khi hết hạn mức', async () => {
  const { deps, calls } = makeDeps()
  deps.budget = { check: async () => ({ allowed: false, spentUsd: 150, limitUsd: 100 }) }

  await expect(executeProbeJob(job, deps)).rejects.toBeInstanceOf(BudgetExceededError)
  expect(calls.engineRun).not.toHaveBeenCalled()
  expect(calls.markJob).not.toHaveBeenCalled()
})

it('ném lỗi ra ngoài mà không tự đánh dấu thất bại', async () => {
  const { deps, calls } = makeDeps()
  deps.engines = new Map([['openai', {
    id: 'openai',
    run: async () => { throw new EngineError('openai', 503, 'down') },
  }]])

  await expect(executeProbeJob(job, deps)).rejects.toBeInstanceOf(EngineError)
  expect(calls.markJob).not.toHaveBeenCalled()
})

it('ném lỗi khi engineId chưa được đăng ký', async () => {
  const { deps } = makeDeps()
  await expect(executeProbeJob({ ...job, engineId: 'gemini' }, deps)).rejects.toThrow(/gemini/)
})

it('finalizeRun tính độ phủ và ghi chỉ số theo ngày', async () => {
  const upsert = vi.fn(async () => {})
  const complete = vi.fn(async () => {})
  const { deps } = makeDeps()
  deps.repos.dailyMetrics = { upsert }
  deps.repos.probeRuns = { ...deps.repos.probeRuns, complete }
  deps.repos.observations = {
    ...deps.repos.observations,
    listByRun: async () => [
      { promptId: 'p1', engineId: 'openai', mentioned: true, position: 1, sentiment: 0.5,
        citedOwnDomain: true, competitorIds: ['c1'], accuracyFlags: [] },
      { promptId: 'p2', engineId: 'openai', mentioned: false, position: null, sentiment: null,
        citedOwnDomain: false, competitorIds: [], accuracyFlags: [] },
    ],
  }

  const summary = await finalizeRun(
    { orgId: 'org-1', brandId: 'brand-1', runId: 'run-1', day: '2026-08-06', totalJobs: 4, succeededJobs: 3 },
    deps,
  )

  expect(summary.coverage).toBe(0.75)
  expect(summary.metrics.visibilityRate).toBe(0.5)
  expect(upsert).toHaveBeenCalledWith('org-1', expect.objectContaining({
    brandId: 'brand-1', day: '2026-08-06', coverage: 0.75, visibilityRate: 0.5,
  }))
  expect(complete).toHaveBeenCalledWith('org-1', 'run-1', 0.75)
})

it('finalizeRun trả độ phủ 0 khi run không có job nào', async () => {
  const { deps } = makeDeps()
  const summary = await finalizeRun(
    { orgId: 'org-1', brandId: 'brand-1', runId: 'run-1', day: '2026-08-06', totalJobs: 0, succeededJobs: 0 },
    deps,
  )
  expect(summary.coverage).toBe(0)
})
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

```bash
pnpm vitest run packages/probe-engine/src/run.test.ts
```

Kỳ vọng: FAIL với `Cannot find module './run.js'`.

- [ ] **Step 3: Viết `src/run.ts`**

```ts
import type { EngineId, Engine, EngineResponse } from '@geosuite/shared'
import type {
  BrandRepository, DailyMetricRepository, ObservationRepository, OrganizationRepository,
  ProbeResultRepository, ProbeRunRepository, UsageRepository,
} from '@geosuite/db'
import { extract, type Confirmer } from '@geosuite/extraction'
import { computeMetrics, type MetricSet } from '@geosuite/scoring'
import { BudgetExceededError, type BudgetGuard } from './budget.js'
import { responseCacheKey, type ResponseCache } from './cache.js'
import type { Throttle } from './throttle.js'

export interface ProbeRepos {
  organizations: OrganizationRepository
  brands: BrandRepository
  probeRuns: ProbeRunRepository
  probeResults: ProbeResultRepository
  observations: ObservationRepository
  dailyMetrics: DailyMetricRepository
  usage: UsageRepository
}

export interface ProbeDeps {
  engines: Map<EngineId, Engine>
  cache: ResponseCache
  throttle: Throttle
  budget: BudgetGuard
  confirmer: Confirmer
  repos: ProbeRepos
  cacheTtlSeconds: number
}

export interface ProbeJob {
  orgId: string
  brandId: string
  runId: string
  promptId: string
  promptText: string
  engineId: EngineId
  locale: string
  day: string
}

export async function executeProbeJob(job: ProbeJob, deps: ProbeDeps): Promise<void> {
  const status = await deps.budget.check(job.orgId)
  if (!status.allowed) {
    throw new BudgetExceededError(job.orgId, status.spentUsd, status.limitUsd)
  }

  const engine = deps.engines.get(job.engineId)
  if (engine === undefined) {
    throw new Error(`Engine "${job.engineId}" chưa được đăng ký`)
  }

  const settings = await deps.repos.organizations.getSettings(job.orgId)
  const cacheKey = responseCacheKey({
    prompt: job.promptText,
    engineId: job.engineId,
    model: engineModelHint(job.engineId, settings.sharedCacheEnabled),
    locale: job.locale,
    day: job.day,
  })

  let response: EngineResponse | null = settings.sharedCacheEnabled ? await deps.cache.get(cacheKey) : null
  const cacheHit = response !== null

  if (response === null) {
    await deps.throttle.acquire(job.engineId)
    response = await engine.run({ prompt: job.promptText, locale: job.locale })
    if (settings.sharedCacheEnabled) {
      await deps.cache.set(cacheKey, response, deps.cacheTtlSeconds)
    }
    await deps.repos.usage.record(job.orgId, {
      runId: job.runId,
      engineId: job.engineId,
      purpose: 'probe',
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      costUsd: response.usage.costUsd,
    })
  }

  const brand = await deps.repos.brands.getProfile(job.orgId, job.brandId)

  await deps.repos.probeResults.insert(job.orgId, {
    runId: job.runId,
    promptId: job.promptId,
    engineId: job.engineId,
    model: response.model,
    rawText: response.text,
    latencyMs: response.latencyMs,
    cacheHit,
    citations: response.citations,
    ownDomains: brand.domains,
  })

  const { observation, usage } = await extract(response, brand, deps.confirmer)

  if (usage.costUsd > 0) {
    await deps.repos.usage.record(job.orgId, {
      runId: job.runId,
      engineId: job.engineId,
      purpose: 'extraction',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd,
    })
  }

  await deps.repos.observations.insert(job.orgId, {
    runId: job.runId,
    promptId: job.promptId,
    engineId: job.engineId,
    ...observation,
  })

  await deps.repos.probeRuns.markJob(job.orgId, job.runId, 'succeeded')
}

function engineModelHint(engineId: EngineId, _sharedCacheEnabled: boolean): string {
  return engineId
}

export interface FinalizeInput {
  orgId: string
  brandId: string
  runId: string
  day: string
  totalJobs: number
  succeededJobs: number
}

export interface RunSummary {
  coverage: number
  metrics: MetricSet
}

export async function finalizeRun(input: FinalizeInput, deps: ProbeDeps): Promise<RunSummary> {
  const coverage = input.totalJobs === 0 ? 0 : input.succeededJobs / input.totalJobs
  const rows = await deps.repos.observations.listByRun(input.orgId, input.runId)
  const metrics = computeMetrics(rows)

  await deps.repos.dailyMetrics.upsert(input.orgId, {
    brandId: input.brandId,
    day: input.day,
    visibilityRate: metrics.visibilityRate,
    shareOfVoice: metrics.shareOfVoice,
    citationRate: metrics.citationRate,
    averagePosition: metrics.averagePosition,
    sentimentScore: metrics.sentimentScore,
    accuracyFlagCount: metrics.accuracyFlagCount,
    coverage,
  })

  await deps.repos.probeRuns.complete(input.orgId, input.runId, coverage)

  return { coverage, metrics }
}
```

`engineModelHint` trả về `engineId` thay vì tên model cụ thể vì khoá cache phải xác định được *trước* khi gọi engine, mà tên model chính xác chỉ biết sau khi có phản hồi. Dùng `engineId` là đủ: cấu hình model của một engine cố định trong một lần triển khai, và `day` trong khoá đã giới hạn vòng đời cache xuống một ngày.

`src/index.ts`:

```ts
export * from './throttle.js'
export * from './budget.js'
export * from './cache.js'
export * from './run.js'
```

- [ ] **Step 4: Chạy test để xác nhận thành công**

```bash
pnpm vitest run packages/probe-engine
```

Kỳ vọng: PASS, 23 test.

- [ ] **Step 5: Commit**

```bash
git add packages/probe-engine/src
git commit -m "feat(probe-engine): điều phối job probe và tổng hợp độ phủ"
```

---

### Task 17: Worker, scheduler và CLI

**Files:**
- Create: `apps/worker/package.json`, `apps/worker/tsconfig.json`
- Create: `apps/worker/src/config.ts`, `src/deps.ts`, `src/queues.ts`, `src/enqueue.ts`, `src/scheduler.ts`, `src/enqueue-run.ts`, `src/main.ts`, `src/cli.ts`
- Create: `.env.example`
- Test: `apps/worker/src/config.test.ts`, `src/enqueue.test.ts`

**Interfaces:**
- Consumes: toàn bộ package đã dựng ở Task 1–16
- Produces:
  - `loadConfig(env: NodeJS.ProcessEnv): AppConfig`
  - `buildProbeJobs(input: BuildJobsInput): Omit<ProbeJob, 'runId'>[]`
  - `createDeps(config: AppConfig): AppDeps`
  - `enqueueRun(input: EnqueueInput, deps: AppDeps, flow: FlowProducer): Promise<string | null>` — trả `null` khi brand chưa có prompt hoặc engine nào
  - `enqueueAllBrands(deps: AppDeps, flow: FlowProducer, day: string): Promise<number>`
  - `runOnce(input: RunOnceInput, deps: AppDeps): Promise<RunSummary>` — chạy tuần tự, không qua hàng đợi, dùng cho CLI
  - Lệnh CLI `probe` chạy một run và in chỉ số

- [ ] **Step 1: Tạo app `worker`**

`apps/worker/package.json`:

```json
{
  "name": "@geosuite/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -b",
    "start": "node dist/main.js",
    "probe": "node dist/cli.js"
  },
  "dependencies": {
    "@geosuite/db": "workspace:*",
    "@geosuite/engines": "workspace:*",
    "@geosuite/extraction": "workspace:*",
    "@geosuite/probe-engine": "workspace:*",
    "@geosuite/scoring": "workspace:*",
    "@geosuite/shared": "workspace:*",
    "bullmq": "^5.28.0",
    "ioredis": "^5.4.1"
  }
}
```

`apps/worker/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"],
  "references": [
    { "path": "../../packages/shared" },
    { "path": "../../packages/db" },
    { "path": "../../packages/engines" },
    { "path": "../../packages/extraction" },
    { "path": "../../packages/scoring" },
    { "path": "../../packages/probe-engine" }
  ]
}
```

- [ ] **Step 2: Viết test thất bại cho cấu hình và fan-out**

`apps/worker/src/config.test.ts`:

```ts
import { expect, it } from 'vitest'
import { loadConfig } from './config.js'

const base = {
  DATABASE_URL: 'postgres://localhost:5432/geosuite',
  REDIS_URL: 'redis://localhost:6379',
  OPENAI_API_KEY: 'a',
  PERPLEXITY_API_KEY: 'b',
  GEMINI_API_KEY: 'c',
  SERPAPI_API_KEY: 'd',
}

it('điền tên model mặc định khi biến môi trường không đặt', () => {
  const config = loadConfig(base)
  expect(config.openai.model).toBe('gpt-4o')
  expect(config.perplexity.model).toBe('sonar-pro')
  expect(config.gemini.model).toBe('gemini-2.5-flash')
  expect(config.extraction.model).toBe('gpt-4o-mini')
})

it('cho phép ghi đè tên model qua biến môi trường', () => {
  const config = loadConfig({ ...base, OPENAI_MODEL: 'gpt-4.1', EXTRACTION_MODEL: 'gpt-4.1-mini' })
  expect(config.openai.model).toBe('gpt-4.1')
  expect(config.extraction.model).toBe('gpt-4.1-mini')
})

it('ném lỗi nêu tên biến còn thiếu', () => {
  expect(() => loadConfig({ ...base, OPENAI_API_KEY: undefined })).toThrow(/OPENAI_API_KEY/)
})
```

`apps/worker/src/enqueue.test.ts`:

```ts
import { expect, it } from 'vitest'
import { buildProbeJobs } from './enqueue.js'

it('sinh một job cho mỗi cặp prompt và engine', () => {
  const jobs = buildProbeJobs({
    orgId: 'org-1',
    brandId: 'brand-1',
    day: '2026-08-06',
    prompts: [
      { id: 'p1', text: 'Câu một', locale: 'vi-VN' },
      { id: 'p2', text: 'Câu hai', locale: 'en-US' },
    ],
    engineIds: ['openai', 'gemini'],
  })

  expect(jobs).toHaveLength(4)
  expect(jobs[0]).toEqual({
    orgId: 'org-1', brandId: 'brand-1', promptId: 'p1', promptText: 'Câu một',
    engineId: 'openai', locale: 'vi-VN', day: '2026-08-06',
  })
  expect(jobs.map((j) => `${j.promptId}:${j.engineId}`)).toEqual([
    'p1:openai', 'p1:gemini', 'p2:openai', 'p2:gemini',
  ])
})

it('trả về mảng rỗng khi brand chưa bật engine nào', () => {
  const jobs = buildProbeJobs({
    orgId: 'org-1', brandId: 'brand-1', day: '2026-08-06',
    prompts: [{ id: 'p1', text: 'Câu một', locale: 'vi-VN' }],
    engineIds: [],
  })
  expect(jobs).toEqual([])
})

it('trả về mảng rỗng khi brand chưa có prompt nào đang bật', () => {
  const jobs = buildProbeJobs({
    orgId: 'org-1', brandId: 'brand-1', day: '2026-08-06',
    prompts: [], engineIds: ['openai'],
  })
  expect(jobs).toEqual([])
})
```

- [ ] **Step 3: Chạy test để xác nhận thất bại**

```bash
pnpm install
pnpm vitest run apps/worker
```

Kỳ vọng: FAIL với `Cannot find module './config.js'`.

- [ ] **Step 4: Viết `src/config.ts`**

```ts
export interface EngineCostConfig {
  apiKey: string
  model: string
  inputCostPerMTok: number
  outputCostPerMTok: number
}

export interface AppConfig {
  databaseUrl: string
  redisUrl: string
  cacheTtlSeconds: number
  openai: EngineCostConfig
  perplexity: EngineCostConfig
  gemini: EngineCostConfig
  serp: { apiKey: string; costPerSearchUsd: number }
  extraction: EngineCostConfig
  rateLimits: Record<string, { capacity: number; refillPerSecond: number }>
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]
  if (value === undefined || value === '') {
    throw new Error(`Thiếu biến môi trường ${name}`)
  }
  return value
}

function numberOr(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback
  const parsed = Number(raw)
  if (Number.isNaN(parsed)) throw new Error(`Biến môi trường ${name} không phải số`)
  return parsed
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    redisUrl: required(env, 'REDIS_URL'),
    cacheTtlSeconds: numberOr(env, 'CACHE_TTL_SECONDS', 86_400),
    openai: {
      apiKey: required(env, 'OPENAI_API_KEY'),
      model: env.OPENAI_MODEL ?? 'gpt-4o',
      inputCostPerMTok: numberOr(env, 'OPENAI_INPUT_COST', 2.5),
      outputCostPerMTok: numberOr(env, 'OPENAI_OUTPUT_COST', 10),
    },
    perplexity: {
      apiKey: required(env, 'PERPLEXITY_API_KEY'),
      model: env.PERPLEXITY_MODEL ?? 'sonar-pro',
      inputCostPerMTok: numberOr(env, 'PERPLEXITY_INPUT_COST', 3),
      outputCostPerMTok: numberOr(env, 'PERPLEXITY_OUTPUT_COST', 15),
    },
    gemini: {
      apiKey: required(env, 'GEMINI_API_KEY'),
      model: env.GEMINI_MODEL ?? 'gemini-2.5-flash',
      inputCostPerMTok: numberOr(env, 'GEMINI_INPUT_COST', 0.3),
      outputCostPerMTok: numberOr(env, 'GEMINI_OUTPUT_COST', 2.5),
    },
    serp: {
      apiKey: required(env, 'SERPAPI_API_KEY'),
      costPerSearchUsd: numberOr(env, 'SERPAPI_COST_PER_SEARCH', 0.015),
    },
    extraction: {
      apiKey: required(env, 'OPENAI_API_KEY'),
      model: env.EXTRACTION_MODEL ?? 'gpt-4o-mini',
      inputCostPerMTok: numberOr(env, 'EXTRACTION_INPUT_COST', 0.15),
      outputCostPerMTok: numberOr(env, 'EXTRACTION_OUTPUT_COST', 0.6),
    },
    rateLimits: {
      openai: { capacity: numberOr(env, 'RATE_OPENAI_CAPACITY', 20), refillPerSecond: numberOr(env, 'RATE_OPENAI_REFILL', 5) },
      perplexity: { capacity: numberOr(env, 'RATE_PERPLEXITY_CAPACITY', 10), refillPerSecond: numberOr(env, 'RATE_PERPLEXITY_REFILL', 2) },
      gemini: { capacity: numberOr(env, 'RATE_GEMINI_CAPACITY', 20), refillPerSecond: numberOr(env, 'RATE_GEMINI_REFILL', 5) },
      ai_overviews: { capacity: numberOr(env, 'RATE_SERP_CAPACITY', 10), refillPerSecond: numberOr(env, 'RATE_SERP_REFILL', 2) },
    },
  }
}
```

Giá mặc định là điểm khởi đầu, không phải bảng giá chính thức — chúng đọc từ biến môi trường để cập nhật được mà không cần deploy lại.

- [ ] **Step 5: Viết `src/enqueue.ts`**

```ts
import type { EngineId } from '@geosuite/shared'
import type { ProbeJob } from '@geosuite/probe-engine'
import type { PromptRow } from '@geosuite/db'

export interface BuildJobsInput {
  orgId: string
  brandId: string
  day: string
  prompts: PromptRow[]
  engineIds: EngineId[]
}

export function buildProbeJobs(input: BuildJobsInput): Omit<ProbeJob, 'runId'>[] {
  return input.prompts.flatMap((prompt) =>
    input.engineIds.map((engineId) => ({
      orgId: input.orgId,
      brandId: input.brandId,
      promptId: prompt.id,
      promptText: prompt.text,
      engineId,
      locale: prompt.locale,
      day: input.day,
    })),
  )
}
```

- [ ] **Step 6: Chạy test để xác nhận thành công**

```bash
pnpm vitest run apps/worker
```

Kỳ vọng: PASS, 6 test.

- [ ] **Step 7: Viết `src/deps.ts`**

```ts
import Redis from 'ioredis'
import {
  createBrandRepository, createDailyMetricRepository, createObservationRepository,
  createOrganizationRepository, createEngineConfigRepository, createPool, createProbeResultRepository,
  createProbeRunRepository, createPromptRepository, createUsageRepository,
} from '@geosuite/db'
import {
  createAiOverviewsEngine, createGeminiEngine, createOpenAiEngine, createPerplexityEngine,
} from '@geosuite/engines'
import { createLlmConfirmer } from '@geosuite/extraction'
import {
  createBudgetGuard, createRedisResponseCache, createRedisThrottle, type ProbeDeps,
} from '@geosuite/probe-engine'
import type { AppConfig } from './config.js'

export interface AppDeps {
  probe: ProbeDeps
  redis: Redis
  prompts: ReturnType<typeof createPromptRepository>
  engineConfigs: ReturnType<typeof createEngineConfigRepository>
  close(): Promise<void>
}

export function createDeps(config: AppConfig): AppDeps {
  const pool = createPool(config.databaseUrl)
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null })

  const organizations = createOrganizationRepository(pool)
  const usage = createUsageRepository(pool)

  const probe: ProbeDeps = {
    engines: new Map([
      ['openai', createOpenAiEngine(config.openai)],
      ['perplexity', createPerplexityEngine(config.perplexity)],
      ['gemini', createGeminiEngine(config.gemini)],
      ['ai_overviews', createAiOverviewsEngine(config.serp)],
    ]),
    cache: createRedisResponseCache(redis),
    throttle: createRedisThrottle(redis, config.rateLimits),
    budget: createBudgetGuard({ organizations, usage }),
    confirmer: createLlmConfirmer(config.extraction),
    cacheTtlSeconds: config.cacheTtlSeconds,
    repos: {
      organizations,
      brands: createBrandRepository(pool),
      probeRuns: createProbeRunRepository(pool),
      probeResults: createProbeResultRepository(pool),
      observations: createObservationRepository(pool),
      dailyMetrics: createDailyMetricRepository(pool),
      usage,
    },
  }

  return {
    probe,
    redis,
    prompts: createPromptRepository(pool),
    engineConfigs: createEngineConfigRepository(pool),
    async close() {
      await redis.quit()
      await pool.end()
    },
  }
}
```

- [ ] **Step 8: Viết `src/queues.ts`, `src/scheduler.ts` và `src/main.ts`**

`src/queues.ts`:

```ts
import { FlowProducer, Queue, Worker, type ConnectionOptions } from 'bullmq'
import type { ProbeJob } from '@geosuite/probe-engine'

export const PROBE_QUEUE = 'probe'
export const FINALIZE_QUEUE = 'finalize'
export const SCHEDULE_QUEUE = 'schedule'
export const PROBE_ATTEMPTS = 3

export interface FinalizeJobData {
  orgId: string
  brandId: string
  runId: string
  day: string
  totalJobs: number
}

export function createProbeQueue(connection: ConnectionOptions): Queue<ProbeJob> {
  return new Queue<ProbeJob>(PROBE_QUEUE, { connection })
}

export function createFlowProducer(connection: ConnectionOptions): FlowProducer {
  return new FlowProducer({ connection })
}

export { Worker }
```

`src/scheduler.ts`:

```ts
import type { FlowProducer } from 'bullmq'
import type { AppDeps } from './deps.js'
import { buildProbeJobs } from './enqueue.js'
import { FINALIZE_QUEUE, PROBE_ATTEMPTS, PROBE_QUEUE } from './queues.js'

export interface EnqueueInput {
  orgId: string
  brandId: string
  day: string
}

export async function enqueueRun(
  input: EnqueueInput,
  deps: AppDeps,
  flow: FlowProducer,
): Promise<string | null> {
  const [prompts, engineIds] = await Promise.all([
    deps.prompts.listActive(input.orgId, input.brandId),
    deps.engineConfigs.listEnabled(input.orgId, input.brandId),
  ])

  const jobs = buildProbeJobs({ ...input, prompts, engineIds })
  if (jobs.length === 0) return null

  const runId = await deps.probe.repos.probeRuns.create(input.orgId, {
    brandId: input.brandId,
    day: input.day,
    totalJobs: jobs.length,
  })

  await flow.add({
    name: 'finalize',
    queueName: FINALIZE_QUEUE,
    data: { ...input, runId, totalJobs: jobs.length },
    children: jobs.map((job) => ({
      name: `${job.promptId}:${job.engineId}`,
      queueName: PROBE_QUEUE,
      data: { ...job, runId },
      opts: {
        attempts: PROBE_ATTEMPTS,
        backoff: { type: 'exponential', delay: 5_000 },
        ignoreDependencyOnFailure: true,
      },
    })),
  })

  return runId
}

export async function enqueueAllBrands(deps: AppDeps, flow: FlowProducer, day: string): Promise<number> {
  let enqueued = 0
  for (const org of await deps.probe.repos.organizations.listAll()) {
    for (const brand of await deps.probe.repos.brands.listByOrg(org.id)) {
      const runId = await enqueueRun({ orgId: org.id, brandId: brand.id, day }, deps, flow)
      if (runId !== null) enqueued += 1
    }
  }
  return enqueued
}
```

`ignoreDependencyOnFailure: true` giữ cho job `finalize` vẫn chạy khi một số job con hỏng — đó là điều kiện để độ phủ có ý nghĩa. Nếu không đặt, một engine hỏng sẽ khiến cả lần chạy không bao giờ được tổng hợp.

Scheduler duyệt theo org rồi mới đến brand, thay vì quét thẳng bảng `brands`. Lý do: `brands` bật RLS nên không có truy vấn nào đọc được xuyên tenant. `organizations` không bật RLS nên liệt kê được, và mỗi lượt gọi `listByOrg` chạy trong đúng ngữ cảnh org của nó.

`src/main.ts`:

```ts
import { Queue, Worker } from 'bullmq'
import { executeProbeJob, finalizeRun, type ProbeJob } from '@geosuite/probe-engine'
import { loadConfig } from './config.js'
import { createDeps } from './deps.js'
import { createFlowProducer, FINALIZE_QUEUE, PROBE_ATTEMPTS, PROBE_QUEUE, SCHEDULE_QUEUE, type FinalizeJobData } from './queues.js'
import { enqueueAllBrands } from './scheduler.js'

const config = loadConfig(process.env)
const deps = createDeps(config)
const connection = { url: config.redisUrl }

const probeWorker = new Worker<ProbeJob>(
  PROBE_QUEUE,
  async (job) => {
    try {
      await executeProbeJob(job.data, deps.probe)
    } catch (error) {
      if (job.attemptsMade + 1 >= PROBE_ATTEMPTS) {
        await deps.probe.repos.probeRuns.markJob(job.data.orgId, job.data.runId, 'failed')
      }
      throw error
    }
  },
  { connection, concurrency: 8 },
)

const finalizeWorker = new Worker<FinalizeJobData>(
  FINALIZE_QUEUE,
  async (job) => {
    const { orgId, brandId, runId, day, totalJobs } = job.data
    const children = await job.getChildrenValues()
    const succeededJobs = Object.values(children).length
    const summary = await finalizeRun({ orgId, brandId, runId, day, totalJobs, succeededJobs }, deps.probe)
    console.log(`Run ${runId}: độ phủ ${(summary.coverage * 100).toFixed(1)}%`)
  },
  { connection },
)

const flow = createFlowProducer(connection)

const scheduleQueue = new Queue(SCHEDULE_QUEUE, { connection })
await scheduleQueue.upsertJobScheduler('daily-probe', { pattern: '0 3 * * *' }, { name: 'daily-probe' })

const scheduleWorker = new Worker(
  SCHEDULE_QUEUE,
  async () => {
    const day = new Date().toISOString().slice(0, 10)
    const count = await enqueueAllBrands(deps, flow, day)
    console.log(`Đã xếp hàng ${count} lần chạy cho ngày ${day}.`)
  },
  { connection },
)

async function shutdown(): Promise<void> {
  await probeWorker.close()
  await finalizeWorker.close()
  await scheduleWorker.close()
  await flow.close()
  await scheduleQueue.close()
  await deps.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.log('Worker đã khởi động, đang chờ job.')
```

- [ ] **Step 9: Viết `src/enqueue-run.ts` và `src/cli.ts`**

`src/enqueue-run.ts`:

```ts
import { executeProbeJob, finalizeRun, type RunSummary } from '@geosuite/probe-engine'
import type { AppDeps } from './deps.js'
import { buildProbeJobs } from './enqueue.js'

export interface RunOnceInput {
  orgId: string
  brandId: string
  day: string
}

export async function runOnce(input: RunOnceInput, deps: AppDeps): Promise<RunSummary> {
  const [prompts, engineIds] = await Promise.all([
    deps.prompts.listActive(input.orgId, input.brandId),
    deps.engineConfigs.listEnabled(input.orgId, input.brandId),
  ])

  const jobs = buildProbeJobs({ ...input, prompts, engineIds })
  const runId = await deps.probe.repos.probeRuns.create(input.orgId, {
    brandId: input.brandId,
    day: input.day,
    totalJobs: jobs.length,
  })

  let succeededJobs = 0
  for (const job of jobs) {
    try {
      await executeProbeJob({ ...job, runId }, deps.probe)
      succeededJobs += 1
    } catch (error) {
      console.error(`Job ${job.promptId}/${job.engineId} thất bại:`, error)
      await deps.probe.repos.probeRuns.markJob(input.orgId, runId, 'failed')
    }
  }

  return finalizeRun(
    { orgId: input.orgId, brandId: input.brandId, runId, day: input.day, totalJobs: jobs.length, succeededJobs },
    deps.probe,
  )
}
```

`src/cli.ts`:

```ts
import { parseArgs } from 'node:util'
import { loadConfig } from './config.js'
import { createDeps } from './deps.js'
import { runOnce } from './enqueue-run.js'

const { values } = parseArgs({
  options: {
    org: { type: 'string' },
    brand: { type: 'string' },
    day: { type: 'string' },
  },
})

if (values.org === undefined || values.brand === undefined) {
  console.error('Cách dùng: pnpm --filter @geosuite/worker probe -- --org <uuid> --brand <uuid> [--day YYYY-MM-DD]')
  process.exit(1)
}

const day = values.day ?? new Date().toISOString().slice(0, 10)
const deps = createDeps(loadConfig(process.env))

try {
  const summary = await runOnce({ orgId: values.org, brandId: values.brand, day }, deps)
  console.log(`Độ phủ: ${(summary.coverage * 100).toFixed(1)}%`)
  console.table({
    'Visibility Rate': summary.metrics.visibilityRate,
    'Share of Voice': summary.metrics.shareOfVoice,
    'Citation Rate': summary.metrics.citationRate,
    'Average Position': summary.metrics.averagePosition,
    'Sentiment Score': summary.metrics.sentimentScore,
    'Accuracy Flags': summary.metrics.accuracyFlagCount,
  })
} finally {
  await deps.close()
}
```

- [ ] **Step 10: Viết `.env.example`**

```bash
DATABASE_URL=postgres://geosuite:geosuite@localhost:5432/geosuite
REDIS_URL=redis://localhost:6379
CACHE_TTL_SECONDS=86400

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
PERPLEXITY_API_KEY=
PERPLEXITY_MODEL=sonar-pro
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
SERPAPI_API_KEY=
EXTRACTION_MODEL=gpt-4o-mini
```

- [ ] **Step 11: Kiểm tra toàn bộ**

```bash
pnpm build
pnpm test
```

Kỳ vọng: build thành công, toàn bộ test PASS.

- [ ] **Step 12: Commit**

```bash
git add apps/worker .env.example pnpm-lock.yaml
git commit -m "feat(worker): hàng đợi, scheduler và CLI chạy một lần probe"
```

---

## Kiểm chứng cuối

Sau Task 17, lõi đo lường chạy được đầu-cuối. Cách kiểm chứng bằng dữ liệu thật:

1. Chạy Postgres và Redis cục bộ, đặt `DATABASE_URL` và `REDIS_URL`.
2. Chạy migration: `pnpm --filter @geosuite/db run migrate`.
3. Chèn thủ công một org, một brand, hồ sơ brand, vài prompt và bản ghi `engine_configs` (nhớ đặt `app.current_org` trước khi chèn các bảng có RLS).
4. Chạy `pnpm --filter @geosuite/worker probe -- --org <uuid> --brand <uuid>`.
5. Đối chiếu: `daily_metrics` có đúng một dòng cho ngày hôm nay, `probe_runs.coverage` khớp tỷ lệ job thành công, và `usage_records` ghi nhận chi phí của cả `probe` lẫn `extraction`.

## Việc không thuộc kế hoạch này

- Giao diện web, đăng nhập, onboarding, dashboard — thuộc kế hoạch tiếp theo.
- Cảnh báo, connector, phân tích nội dung — thuộc giai đoạn 2 đến 4 của lộ trình trong spec.
- Chuyển `probe_results` sang object storage sau 90 ngày — cần thiết khi dữ liệu lớn, chưa cần ở giai đoạn này.
