# GeoSuite

GeoSuite helps teams understand how their brand appears in AI-generated answers. It brings together a web workspace for setting up a brand and prompts, and a background measurement pipeline for querying AI and search providers, extracting observations, and calculating visibility metrics.

This repository is actively evolving. You don’t need to understand every package before you get started—begin with the web app or follow a worker run through the packages as you get comfortable.

## What’s here

- `apps/web` — React and Vite workspace for signing in, onboarding, and viewing brand tracking pages.
- `apps/worker` — background jobs and a command-line runner for collecting measurements.
- `packages/engines` — adapters for OpenAI, Perplexity, Gemini, and Google AI Overviews via SerpAPI.
- `packages/extraction` — identifies brand and competitor mentions in provider responses.
- `packages/probe-engine` — runs and finalizes measurement jobs, with caching, rate limiting, and budget checks.
- `packages/scoring` — computes visibility, share of voice, citation, position, sentiment, and accuracy metrics.
- `packages/db` — database schema and repositories; `packages/shared` — common types and schemas.
- `supabase` — local Supabase configuration and migrations.

## Getting started

You’ll need Node.js 22 or newer and pnpm 9.12.0. From the repository root:

```sh
pnpm install
pnpm build
pnpm test
```

To start the web app:

```sh
pnpm --filter @geosuite/web dev
```

Vite prints the local URL (usually `http://localhost:5173`). The web app uses Supabase for authentication and workspace storage; set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the environment where Vite runs. For local auth, the Supabase config uses Google OAuth, so configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as needed. The browser key must be the Supabase anon/publishable key—never put a service-role key in `VITE_*` variables.

## Running the measurement worker

The worker requires PostgreSQL, Redis, and credentials for each configured provider. Copy `.env.example` to `.env` (or export the values in your shell) and fill in the values for the services and providers you intend to use. The worker currently requires `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `GEMINI_API_KEY`, and `SERPAPI_API_KEY`; see `.env.example` for model names, cost estimates, cache settings, and rate-limit overrides. Keep secrets out of source control.

Build the workspace, then start the worker:

```sh
pnpm build
pnpm --filter @geosuite/worker start
```

The worker schedules daily probes. You can also run a single brand measurement by organization and brand UUID:

```sh
pnpm --filter @geosuite/worker probe -- --org <organization-uuid> --brand <brand-uuid> --day 2026-09-25
```

The date is optional and defaults to today. A probe uses active prompts and enabled engines configured for that brand; if either is missing, there may be no work to run.

## Useful commands

Run these from the repository root:

| Command | What it does |
| --- | --- |
| `pnpm --filter @geosuite/web dev` | Starts the Vite development server. |
| `pnpm build` | Type-checks and builds the TypeScript workspace. |
| `pnpm test` | Runs the workspace Vitest suite. |
| `pnpm --filter @geosuite/web build` | Builds the web app for production. |
| `pnpm --filter @geosuite/worker start` | Starts the background worker (after building and configuring services). |

## How measurements work

For each configured prompt and enabled engine, GeoSuite collects a response, extracts brand/competitor observations and citations, and computes summary metrics. Provider calls are rate-limited and costed; the worker tracks usage and respects organization budgets. Results should be interpreted alongside run coverage: incomplete runs represent a smaller sample and aren’t directly comparable to complete ones.

## Contributing

Thanks for helping make GeoSuite better. A good place to begin is a focused test or a small improvement in the package closest to the behavior you’re exploring. The codebase includes tests alongside core packages, and the root `pnpm test` command runs them together. If setup is unclear or a command doesn’t work as described, that’s useful feedback—please open an issue with the command, relevant error output, and a note about your environment. Don’t include API keys or other secrets.

## License

No license is currently specified. Please check with the project maintainers before redistributing or using this project beyond its intended scope.
