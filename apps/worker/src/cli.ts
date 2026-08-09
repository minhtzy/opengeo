import { parseArgs } from 'node:util'
import { loadConfig } from './config.js'
import { createDeps } from './deps.js'
import { runOnce } from './enqueue-run.js'
const { values } = parseArgs({ options: { org: { type: 'string' }, brand: { type: 'string' }, day: { type: 'string' } } })
if (!values.org || !values.brand) { console.error('Cách dùng: pnpm --filter @geosuite/worker probe -- --org <uuid> --brand <uuid> [--day YYYY-MM-DD]'); process.exit(1) }
const deps = createDeps(loadConfig(process.env))
try { const summary = await runOnce({ orgId: values.org, brandId: values.brand, day: values.day ?? new Date().toISOString().slice(0, 10) }, deps); console.log(`Độ phủ: ${(summary.coverage * 100).toFixed(1)}%`); console.table({ 'Visibility Rate': summary.metrics.visibilityRate, 'Share of Voice': summary.metrics.shareOfVoice, 'Citation Rate': summary.metrics.citationRate, 'Average Position': summary.metrics.averagePosition, 'Sentiment Score': summary.metrics.sentimentScore, 'Accuracy Flags': summary.metrics.accuracyFlagCount }) } finally { await deps.close() }
