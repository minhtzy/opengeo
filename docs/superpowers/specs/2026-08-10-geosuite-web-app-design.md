# GeoSuite web app: authentication, onboarding and dashboard

## Goal

Create a minimal SaaS web experience that lets a new user sign in, configure
their brand's AI-search visibility tracking, and understand that initial data
collection is in progress.

## Scope

The first web application covers three routes:

- `/login` provides email/password fields, a Google sign-in affordance, and a
  password-reset link. It is a UI-only experience; no real credentials or
  authentication provider is connected in this increment.
- `/onboarding` is a two-step flow. The first step requires a brand name and
  website. The second step lets a user choose website tracking or topic/prompt
  tracking, with prompts optional. Completing it records a local configuration
  and directs the user to the dashboard.
- `/dashboard` is the analytics home for a configured brand whose first scan
  has not completed. It intentionally presents a collection-in-progress state,
  not invented metrics or sample results.

## Information architecture

The dashboard has a persistent sidebar with Overview, Prompts, Sources, and
Settings. The overview header contains a brand selector and time-range control.
The content area contains:

1. A clearly labelled collection progress banner, including expected first
   result timing.
2. KPI cards rendered as intentional loading placeholders.
3. A visibility-trend chart placeholder.
4. An AI-source table placeholder.

This makes the eventual data hierarchy legible while preserving honesty about
the absence of measured results.

## UI direction

Use a restrained analytics SaaS aesthetic: a light neutral canvas, dark navy
text, one indigo accent, subtle border/shadow treatment, generous whitespace,
and strong typographic hierarchy. Forms and controls must work comfortably at
small viewport widths; the dashboard sidebar may collapse to a compact mobile
navigation treatment.

## State and boundaries

Keep UI state behind route-focused components and small local helpers:

- Auth UI owns form validation and submit feedback only.
- Onboarding owns drafts, step navigation, validation, and completion.
- A storage adapter is the sole place responsible for persisting the temporary
  brand configuration in the browser.
- Dashboard consumes the stored configuration and a fixed `collecting` status.

The adapter boundary will allow replacement with the existing backend/API
without rewriting route components. Invalid or missing configuration on the
dashboard redirects to onboarding. Login submission must report a clear UI
message rather than falsely claiming authentication succeeded.

## Error handling

- Brand name and website are required before the first onboarding step advances.
- Website values must be valid HTTP(S) URLs, accepting a user-entered hostname
  after normalization.
- Prompt mode permits an empty prompt list, but displays explanatory copy.
- Browser storage failures leave the user on the final onboarding step with an
  actionable error message.

## Verification

Automated tests cover route availability, onboarding validation, configuration
persistence, redirect behaviour for an unconfigured dashboard, and dashboard
collecting-state copy. Manual browser verification covers desktop/mobile layout
and the route sequence login → onboarding → dashboard.

## Non-goals

- Real authentication, OAuth, password reset, or account creation.
- Calling the measurement workers or displaying fabricated analytics.
- Editing prompts, sources, and settings beyond their navigation affordances.
