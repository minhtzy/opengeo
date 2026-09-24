# GeoSuite Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Vite-powered React web app with login, brand-tracking onboarding, and a truthful collecting-state analytics dashboard.

**Architecture:** Create a self-contained `apps/web` workspace. Route selection and browser persistence are explicit, framework-light modules so the UI can later swap to an API/auth client without redesigning screen components. The dashboard only consumes an onboarding configuration and never invents measurement values.

**Tech Stack:** React 18, TypeScript, Vite, React Router, Vitest, Testing Library, CSS custom properties.

---

## File structure

- `apps/web/package.json`: workspace scripts and browser dependencies.
- `apps/web/vite.config.ts`: Vite and browser-test environment configuration.
- `apps/web/index.html`, `src/main.tsx`: application entrypoint.
- `apps/web/src/lib/brand-config.ts`: normalize/validate/persist brand setup.
- `apps/web/src/lib/brand-config.test.ts`: pure adapter tests.
- `apps/web/src/routes/*`: one focused route component per screen.
- `apps/web/src/App.tsx`: route definitions and missing-dashboard redirect.
- `apps/web/src/styles.css`: responsive design system and screen styles.
- `apps/web/src/test/setup.ts`, `src/App.test.tsx`: route-level test setup and behaviours.

### Task 1: Scaffold the browser workspace

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/main.tsx`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Add a failing app import test**

Create `apps/web/src/App.test.tsx` with:

```tsx
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('exports the web application', () => {
    expect(App).toBeTypeOf('function')
  })
})
```

- [ ] **Step 2: Verify it fails because the application does not exist**

Run: `pnpm test apps/web/src/App.test.tsx`

Expected: FAIL with a module-resolution error for `./App`.

- [ ] **Step 3: Add the minimal Vite/React application shell**

Set `apps/web/package.json` scripts to `dev: vite`, `build: tsc -b && vite build`, and `test: vitest run`; add React, React DOM, React Router DOM, Vite, Testing Library, jsdom, and their TypeScript types. Configure the root Vitest include as `apps/**/src/**/*.test.ts?(x)`, configure `apps/web/vite.config.ts` with `environment: 'jsdom'` and `setupFiles: ['./src/test/setup.ts']`, and export this minimal app:

```tsx
export default function App() {
  return <main>GeoSuite</main>
}
```

Mount it using `createRoot(document.getElementById('root')!).render(<App />)`.

- [ ] **Step 4: Verify the test passes**

Run: `pnpm test apps/web/src/App.test.tsx`

Expected: PASS with one test.

- [ ] **Step 5: Commit the scaffold**

```bash
git add apps/web vitest.config.ts pnpm-lock.yaml
git commit -m "feat(web): scaffold GeoSuite browser app"
```

### Task 2: Build and test the brand-configuration adapter

**Files:**
- Create: `apps/web/src/lib/brand-config.ts`, `apps/web/src/lib/brand-config.test.ts`

- [ ] **Step 1: Write the failing validation and persistence tests**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeWebsite, saveBrandConfig, loadBrandConfig } from './brand-config'

describe('brand configuration', () => {
  it('normalizes a hostname into an HTTPS URL', () => {
    expect(normalizeWebsite('geosuite.ai')).toBe('https://geosuite.ai')
  })

  it('rejects non-HTTP URLs', () => {
    expect(normalizeWebsite('ftp://geosuite.ai')).toBeNull()
  })

  it('round-trips a complete configuration through storage', () => {
    const config = { brandName: 'GeoSuite', website: 'https://geosuite.ai', trackingMode: 'website' as const, prompts: [] }
    saveBrandConfig(config)
    expect(loadBrandConfig()).toEqual(config)
  })
})
```

- [ ] **Step 2: Verify the adapter tests fail**

Run: `pnpm test apps/web/src/lib/brand-config.test.ts`

Expected: FAIL because `brand-config.ts` has not been created.

- [ ] **Step 3: Implement the smallest explicit adapter**

Define `BrandConfig`, store it under `geosuite:brand-config`, prefix schemeless hostnames with `https://`, accept only `http:` or `https:`, and return `null` for malformed/missing JSON. `saveBrandConfig` must return `false` when `localStorage.setItem` throws so the onboarding screen can display an error.

- [ ] **Step 4: Verify adapter behaviour passes**

Run: `pnpm test apps/web/src/lib/brand-config.test.ts`

Expected: PASS with three tests.

- [ ] **Step 5: Commit the adapter**

```bash
git add apps/web/src/lib
git commit -m "feat(web): persist onboarding brand configuration"
```

### Task 3: Implement login and onboarding routes with red-green tests

**Files:**
- Create: `apps/web/src/routes/LoginPage.tsx`, `apps/web/src/routes/OnboardingPage.tsx`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`

- [ ] **Step 1: Add failing route/UI tests**

```tsx
it('shows the sign-in form at /login', () => {
  render(<MemoryRouter initialEntries={['/login']}><App /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
})

it('blocks onboarding until brand name and a valid website are supplied', async () => {
  render(<MemoryRouter initialEntries={['/onboarding']}><App /></MemoryRouter>)
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))
  expect(screen.getByText(/brand name is required/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Verify the tests fail for absent routes**

Run: `pnpm test apps/web/src/App.test.tsx`

Expected: FAIL because neither heading nor validation message exists.

- [ ] **Step 3: Implement the route components**

Create `/login`, `/onboarding`, and `/dashboard` route definitions. Login includes labelled email/password controls, Google and reset-password affordances, and on submit displays `Sign-in is not connected yet.`. Onboarding uses `useState` for step/draft/errors; step one requires a trimmed brand name and `normalizeWebsite`; step two offers `website` and `prompts` radio choices, a textarea for optional line-separated prompts, and calls `saveBrandConfig` before navigating to `/dashboard`. If save returns false, render `We could not save your setup. Please try again.`

- [ ] **Step 4: Verify the route tests pass**

Run: `pnpm test apps/web/src/App.test.tsx`

Expected: PASS, including login and onboarding assertions.

- [ ] **Step 5: Commit the route flow**

```bash
git add apps/web/src/App.tsx apps/web/src/App.test.tsx apps/web/src/routes
git commit -m "feat(web): add login and brand onboarding flow"
```

### Task 4: Implement the dashboard collecting state and redirect

**Files:**
- Create: `apps/web/src/routes/DashboardPage.tsx`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`

- [ ] **Step 1: Write failing dashboard tests**

```tsx
it('redirects an unconfigured dashboard to onboarding', () => {
  render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: /set up your tracking/i })).toBeInTheDocument()
})

it('shows a collecting state for a configured brand', () => {
  saveBrandConfig({ brandName: 'GeoSuite', website: 'https://geosuite.ai', trackingMode: 'website', prompts: [] })
  render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>)
  expect(screen.getByText(/collecting your first AI visibility data/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Verify the dashboard tests fail**

Run: `pnpm test apps/web/src/App.test.tsx`

Expected: FAIL because no collecting dashboard exists.

- [ ] **Step 3: Implement dashboard-only collecting UI**

Use `loadBrandConfig()` at dashboard entry and navigate to `/onboarding` when absent. When configured, render sidebar navigation (Overview, Prompts, Sources, Settings), a header with the configured brand and a `Last 30 days` control, a `Collecting your first AI visibility data` banner, `Expected first result within 10 minutes` copy, four labelled skeleton KPI cards, skeleton chart, and skeleton source table. Do not render numeric analytics.

- [ ] **Step 4: Verify all route tests pass**

Run: `pnpm test apps/web/src/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the dashboard state**

```bash
git add apps/web/src/routes/DashboardPage.tsx apps/web/src/App.tsx apps/web/src/App.test.tsx
git commit -m "feat(web): add collecting analytics dashboard"
```

### Task 5: Apply the responsive SaaS visual system and verify

**Files:**
- Create: `apps/web/src/styles.css`
- Modify: `apps/web/src/main.tsx`, `apps/web/src/routes/LoginPage.tsx`, `apps/web/src/routes/OnboardingPage.tsx`, `apps/web/src/routes/DashboardPage.tsx`

- [ ] **Step 1: Add a failing visual-structure test**

```tsx
it('marks loading analytics as status content', () => {
  saveBrandConfig({ brandName: 'GeoSuite', website: 'https://geosuite.ai', trackingMode: 'website', prompts: [] })
  render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>)
  expect(screen.getByRole('status')).toHaveTextContent(/collecting your first/i)
})
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm test apps/web/src/App.test.tsx`

Expected: FAIL because the collection banner is not exposed as a live status.

- [ ] **Step 3: Add semantic class names and CSS**

Import `styles.css` from `main.tsx`. Define design tokens for navy, indigo, neutral surfaces, borders, radius and shadows; style a centered auth/onboarding shell, progress indicator, responsive form controls, dashboard grid, accessible focus states, shimmer skeletons, and a media query below `760px` that changes dashboard navigation to a compact horizontal row. Add `role="status"` and `aria-live="polite"` to the collection banner.

- [ ] **Step 4: Verify unit tests and production build**

Run: `pnpm test && pnpm --filter @geosuite/web build && pnpm typecheck`

Expected: all tests pass, the Vite build emits `apps/web/dist`, and TypeScript exits 0.

- [ ] **Step 5: Manually verify in the browser**

Run: `pnpm --filter @geosuite/web dev -- --host 127.0.0.1`

Check `/login`, complete onboarding with `GeoSuite` and `geosuite.ai`, confirm the collecting dashboard and test viewport widths 1440px and 390px.

- [ ] **Step 6: Commit styling and verification-ready app**

```bash
git add apps/web
git commit -m "feat(web): style responsive GeoSuite analytics experience"
```
