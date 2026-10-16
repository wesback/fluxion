# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

Fluxion tracks Linux package updates across hosts. It helps operators inspect
update activity, host reporting recency, security-tagged updates, and kernel
versions without replacing the existing collection and administration workflows.

## Users

Primary working audience: infrastructure operators investigating package and host
activity. This audience is inferred from the existing product and should be
confirmed during redesign review.

## Capabilities and Constraints

- Preserve dashboard, host/detail, package search, activity, kernel, security, and
  administration routes and their existing functionality.
- Use the existing Next.js, React, TypeScript, Tailwind, Recharts, TanStack Query,
  server-side API proxy, and theme infrastructure.
- The redesign must not change backend logic or remove existing visualizations.
- Use existing supported metrics instead of inventing uptime, response-time, or
  period-over-period trend measurements.
- Add frontend Reports and Alerts views using existing APIs while preserving all
  existing routes. These are new views, not a new reporting or alerting backend.
- Account profiles and a notification inbox are deferred.
- Host health describes package-report recency, not host availability or uptime.

## Brand Commitments

The user has chosen a professional, futuristic infrastructure dashboard with
calm, premium SaaS execution and a supplied dual-theme reference image. The
redesign PRD is the authority for the proposed visual requirements; this product
record does not describe the currently shipped design.

## Evidence on Hand

- Current dashboard and data contracts: `frontend/app/page.tsx`,
  `frontend/lib/api.ts`, and `frontend/lib/hooks/use-api.ts`.
- Existing host-health meaning: `frontend/lib/host-health.ts`.
- User-supplied visual reference: `docs/prd/assets/fluxion-redesign-reference.jpeg`.
- Proposed release requirements: `docs/prd/fluxion-observability-redesign.md`.

## Product Principles

- Show only measurements supported by their actual source and time window.
- Make operational exceptions easier to find without obscuring normal activity.
- Preserve familiar destinations and direct links during navigation changes.
- Treat unavailable data as unknown, not as healthy or zero.

## Accessibility & Inclusion

Target WCAG 2.2 AA, keyboard operability, light and dark themes, reduced motion,
and opaque rendering fallbacks for unsupported or constrained devices.
