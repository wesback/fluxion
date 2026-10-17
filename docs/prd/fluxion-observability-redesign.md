---
prd_id: PRD-FLUXION-REDESIGN
title: Fluxion Premium Observability Redesign
status: draft
version: 0.1.0
created_date: 2026-10-16
last_updated: 2026-10-16
product_goal_ids: [GOAL-001, GOAL-002, GOAL-003, GOAL-004]
product_goal_smart_status: proposed
fr_to_ac_coverage_threshold_pct: 100
fr_to_goal_coverage_threshold_pct: 100
diagram_format: none
source_brd_id: null
lineage:
  supersedes: []
  superseded_by: []
---

# Fluxion Premium Observability Redesign

> Draft for product and engineering review. This document specifies a future
> frontend release; it does not claim that the redesign is implemented or approved.

## Executive Summary

Redesign Fluxion as a professional, futuristic infrastructure dashboard: premium,
calm, spacious, technical, and immediately useful to operators. Adopt the supplied
dual-theme reference's layered navy surfaces, restrained cyan/violet accents,
wave-lit overview, disciplined navigation rail, readable charts, and dense but
legible update history. Avoid cyberpunk styling, gaming aesthetics, neon overload,
pure-black cards, and decoration that competes with operational information.

The release is a frontend redesign, not a new observability backend. Preserve
Fluxion's Linux package-update tracking, reporting-recency health semantics,
security-tagged update history, kernel views, filters, exports, administration,
instrumentation, and existing URLs. Add useful Reports and Alerts frontend views
by composing existing API data.

The user confirmed two scope decisions: use supported existing metrics instead
of uptime/latency or invented trends, and defer account/notification features;
preserve every existing route while adding Reports and Alerts over current APIs.
No backend, schema, ingestion, authentication-policy, or alert-delivery changes
are included.

Release horizon: one redesign release, R1, followed by a two-week observation
window. No calendar delivery date or implementation estimate has been agreed.

## Product Context and Evidence

### Current product truth

Fluxion is a package-update observability tool, not a general host-availability,
APM, incident-management, or vulnerability-scanning platform. Health currently
means recency of a host's package reports. The redesign must make that distinction
more legible, not turn it into an unsupported uptime claim.

| Evidence | What it establishes |
|---|---|
| [Dashboard](../../frontend/app/page.tsx) | Five current metrics, two ranked bar charts, recent updates, manual refresh |
| [API types and client](../../frontend/lib/api.ts) | Available metrics, activity buckets, security events, diagnostics, exports and admin operations |
| [Query hooks](../../frontend/lib/hooks/use-api.ts) | Current query/cache behavior and 30-second recent-update refresh |
| [Host health](../../frontend/lib/host-health.ts) | Reporting-recency classification, not an availability measurement |
| [Navigation](../../frontend/components/navbar.tsx) | Current Dashboard, Hosts, Kernels, Activity, Packages, Security and Admin destinations |
| [Activity](../../frontend/app/activity/page.tsx) | Bucketed activity, URL filters, totals, line chart and export |
| [Security](../../frontend/app/security/page.tsx) | Security-tagged events, filtered feed, rankings and capped export |
| [Diagnostics](../../frontend/app/admin/diagnostics/page.tsx) | Ingest outcomes and webhook coverage, subject to existing authorization |
| [Tables](../../frontend/components/updates-table.tsx) | Host/package/version/time semantics and security markers |
| [Reference image](assets/fluxion-redesign-reference.jpeg) | User-supplied dark/light visual target; sample values are not production facts |

The user authorized read-only inspection of `https://fluxion.backelant.eu`.
Inspection was unavailable because the fetch tool resolved it to a blocked private
address. No live screenshot, deployment-version comparison, or live-data
verification is claimed. Local source and the supplied image are the baseline.

### Design influences

Use Linear's hierarchy and rhythm, Vercel's restraint, Raycast/Warp's efficient
keyboard interaction, Arc's layered navigation, and Datadog/Grafana Cloud's
operational clarity as quality references. Reinterpret their principles for
Fluxion; do not copy branding, proprietary assets, or unrelated product features.

## Users and Personas

These are working personas inferred from the existing product, not validated
research participants.

| Persona | Job to be done | Successful outcome |
|---|---|---|
| Infrastructure operator | Understand recent package activity and find hosts that stopped reporting | Identify the affected host and open its history without losing context |
| Platform maintainer | Inspect update/security/kernel patterns over a selected period | Read reliable charts, filter records, and export the relevant result set |
| Fluxion administrator | Check ingest/webhook issues and maintain existing configuration | Reach diagnostics or the affected configuration without a new permission model |

Primary usage is repeated desktop investigation; tablet and mobile access must
remain functional for checking status and following up on a specific host.

## Design Decisions

| ID | Decision | Authority and consequence |
|---|---|---|
| DD-001 | The supplied image is the visual target in both themes | User brief; preserve its composition and material language, not its illustrative data |
| DD-002 | Replace unsupported hero uptime/response-time slots with real update metrics | Confirmed by user; no fabricated service metrics |
| DD-003 | Defer user avatar/account menu and notification inbox/bell | Confirmed by user; omit dead controls, fake identities and unread counts |
| DD-004 | Add Reports and Alerts as frontend-only compositions | Confirmed by user; no new backend capability or endpoint contract |
| DD-005 | Keep existing routes and specialized destinations | User preservation requirement; navigation expansion cannot hide Kernels or Security |
| DD-006 | Keep data tables opaque inside frosted card frames | Readability and existing table boundary; backdrop effects must not alter row contrast |
| DD-007 | Brand accents and accessible text/action accents are separate roles | Requested light cyan has approximately 4.10:1 contrast against white; normal text needs a darker role |
| DD-008 | Health refers explicitly to package-report freshness | Existing domain rule; zero hosts, request failures and unknown data are not healthy |
| DD-009 | All cards share the requested geometry; interactive affordances remain semantic | Static cards get no fake button role, click behavior or additional tab stop |
| DD-010 | This PRD does not silently rewrite historical design specifications | The new release intentionally replaces the old palette/blur contract only when implemented |
| DD-011 | R1 permits a narrowly scoped change to backend/fluxion/services/export.py and its tests: CSV cells beginning with =, +, -, @, tab, or carriage return are prefixed with an apostrophe, while JSON values remain unchanged. |

## Product Goals

| ID | Goal for R1 | Measurement |
|---|---|---|
| GOAL-001 | Make operational orientation and drill-down predictable | At least 90% completion across five scripted tasks in a pilot of at least five representative operators; establish the current UI baseline first |
| GOAL-002 | Deliver coherent, accessible dark and light experiences | All release-critical surfaces pass the theme, keyboard, contrast and responsive checklist before release |
| GOAL-003 | Preserve operational trust and functionality | Zero unsupported metric claims, lost existing routes, removed visualizations, or critical workflow regressions at release |
| GOAL-004 | Enable reporting and attention triage using existing data | Reports and Alerts complete their specified read/filter/drill-down flows without backend changes before release |

Pilot tasks: identify a missing host, open its update history, find hosts containing
a package, export activity for a selected date range, and locate a webhook-delivery
failure when authorized. Success means completing each task without moderator help.
The pilot target is proposed; no current task-completion baseline is available.

## Scope and Release Boundary

### Must ship in R1

- Theme tokens and reusable primitives shared across the existing application.
- New application shell, navigation rail, header search and theme control.
- Dashboard overview, KPI row, both existing charts, and recent-update table.
- Frontend Reports and Alerts pages over existing data.
- Preservation and theme integration of existing host/detail, package, activity,
  security, kernel and administration flows.
- Loading, empty, denied, partial-error, refresh, stale-data, and fallback states.
- Responsive, keyboard, reduced-motion and contrast acceptance evidence.

### Explicitly out of scope

Backend logic, database migrations, ingestion agents, new API contracts, SSO,
accounts, notification inbox, push notifications, incident acknowledgement,
alert-rule engines, scheduled reports, saved server-side reports, new telemetry
storage, true uptime/latency monitoring, and invented historical comparisons.
Existing webhook delivery/configuration remains available and unchanged.

## Experience and Layout

### Desktop composition

```text
+-------------------+------------------------------------------------------+
| Fluxion           | Search hosts, packages, pages...        Theme        |
|-------------------+------------------------------------------------------|
| Dashboard         | Dashboard                                  Refresh  |
| Hosts             | Overview of package updates across all hosts         |
| Packages          |                                                      |
| Updates           | +--------------------------------------------------+ |
| Reports           | | Fluxion Health Overview          Reporting badge | |
| Alerts            | | Hosts | Total updates | Last 24h | Last 7 days   | |
| Settings          | +--------------------------------------------------+ |
|                   |                                                      |
| Infrastructure    | KPI cards: Hosts | Recent | Weekly | Host health     |
|   Kernels         |                                                      |
|   Security        | Top 5 Most Updated Packages | Most Active Hosts      |
|                   |                                                      |
| System Health     | Recent Updates table                                 |
+-------------------+------------------------------------------------------+
```

The overview's low-amplitude wave gradient is the single expressive signature.
Navigation, data labels, tables and actions remain quiet. Avoid repeating bright
glows or animated gradients on every surface.

Use a 240px expanded rail at wide desktop, a 72px labeled-tooltip rail for
1024-1279px, and a dismissible drawer below 1024px. The header is 64px high.
Main content uses 32px gutters at wide desktop, 24px at tablet, 16px on mobile,
and a maximum readable width of 1600px. Use a 4px base spacing scale with
16/24/32px gaps. At narrow widths, overview metrics wrap 2x2 then stack when
needed; chart cards stack before labels collide. Cards stretch to their content,
not to arbitrary identical heights.

### Navigation contract

| Rail item | Destination | Preservation requirement |
|---|---|---|
| Dashboard | `/` | Keep current dashboard entry |
| Hosts | `/hosts` | Preserve filters and `/hosts/[hostname]` deep links |
| Packages | `/packages` | Preserve package-search behavior |
| Updates | `/activity` | Existing Activity page; its URL and original function remain |
| Reports | `/reports` | New frontend report composition |
| Alerts | `/alerts` | New current-signal triage page, not notification history |
| Settings | `/admin` | Existing admin home and API Keys/Webhooks/Diagnostics children |
| Kernels, in Infrastructure group | `/kernels` | Always discoverable; do not collapse into an unavailable future feature |
| Security, in Infrastructure group | `/security` | Preserve the security feed, filters and exports |

Active state combines a low-opacity cyan-to-violet highlight, a small accent
edge, and `aria-current="page"`. The glow supplements shape/text; it is not the
only active indicator. Only the actual current destination gets page-current.
The bottom System Health widget opens Alerts with the relevant signal selected.
Do not display an unverified release number or licence claim copied from the image.

### Header and global search

Show Fluxion branding, a search control and theme control. On desktop the rail
may carry the primary wordmark; on mobile the header must expose it beside the
drawer control. Account and notification controls are deferred, not decorative.

Search opens a keyboard-operable dialog with pages, hosts, and package lookup
groups. `Ctrl+K`/`Cmd+K` and the visible control open it; Escape closes it and
restores focus. Host results use the existing host response/cache; package search
uses the current package-host lookup on explicit submission. Never imply a
complete indexed global search or fetch all update records on each keystroke.
Show each result's type and useful scope; provide loading, no-match, and failure
states. Choosing a host opens its existing detail page; choosing a package opens
`/packages?q=<encoded query>`. Initialize and synchronize that frontend query
state as part of R1; the current package page does not yet consume `q`.

## Data and Metric Contracts

| Placement | Label | Source | Window and semantics |
|---|---|---|---|
| Hero | Total Hosts | `Stats.total_hosts` | Registered hosts, as reported by current stats contract |
| Hero | Total Updates | `Stats.total_updates` | All time, not the current chart window |
| Hero | Updates in Last 24 Hours | `Stats.updates_last_24h` | Existing backend-defined rolling window |
| Hero | Updates in Last 7 Days | `Stats.updates_last_7d` | Existing backend-defined rolling window |
| KPI | Total Hosts | Same stats value | Description: Registered hosts |
| KPI | Recent Updates | Same 24-hour value | Description: Last 24 hours |
| KPI | Weekly Updates | Same 7-day value | Description: Last 7 days |
| KPI | Host Health | Host reporting-recency counts | Show stale and missing counts separately |
| Chart | Top 5 Most Updated Packages | `Stats.most_updated_packages` | Preserve source ranking and count; show API-defined scope, not invented range |
| Chart | Most Active Hosts | `Stats.most_active_hosts` | Preserve source ranking and count |
| Table | Recent Updates | `useRecentUpdates(24, 20)` | Last 24 hours, up to 20 returned items, current 30-second refresh |

Repeating a hero value in a KPI is intentional reference fidelity, not a different
measurement. Use consistent number formatting and identical freshness semantics.
No trend percentage, sparkline, historical total, latency, or uptime appears
unless its independent source and comparison period are available. For R1, replace
unsupported trend slots with truthful window/context labels, not invented `+10%`.
Zero is a valid successful response; it is never the fallback for request failure.

### Health truth table

Use the existing helper without changing its thresholds: age <=30 days is
healthy; >30 through 365 days is stale; >365 days, absent timestamps and invalid
timestamps are missing. Keep its current handling of other timestamp cases.

| Evidence | Overview / rail status |
|---|---|
| Complete successful host data, at least one host, none stale or missing | Healthy, with supporting copy "Package reports are current" |
| Any missing host | Attention needed; expose missing count |
| No missing hosts, any stale host | Reports stale; expose stale count |
| Successful empty fleet | No hosts reporting; setup/host destination, not Healthy |
| Loading or never-loaded data | Loading or Unknown, not Healthy |
| Failed refresh with previous data | Last known reporting state, explicitly stale, with last-success time |
| Failed request without previous data | Reporting health unavailable; retry action |

This badge does not certify OS health, network reachability, vulnerability
remediation, service uptime, or the availability of unrelated application APIs.

## Design System Specification

### Colour architecture

Define primitive/brand values and semantic aliases as CSS variables in the shared
theme source. Components, charts and gradients consume semantic roles only.
Literal colour values are permitted in token declarations, not component styles,
inline chart props, or scattered utility strings. Keep existing theme API aliases
where needed during migration; publish one authoritative token source.

All new names below are proposed roles, not requirements to rename existing
compatible variables. Tailwind v4 theme mappings must reference the same source.

| Semantic token | Dark | Light |
|---|---|---|
| `--background` | `#070B14` | `#F8FAFC` |
| `--surface` | `#0F172A` | `#FFFFFF` |
| `--surface-elevated` | `rgba(17,25,40,0.75)` | `rgba(255,255,255,0.88)` |
| `--surface-opaque` | `#111928` | `#FFFFFF` |
| `--surface-subtle` | `#111C30` | `#F1F5F9` |
| `--surface-hover` | `#17243A` | `#EAF2F8` |
| `--surface-selected` | `rgba(0,229,255,0.10)` | `rgba(2,132,199,0.10)` |
| `--foreground` | `#E6EDF7` | `#0F172A` |
| `--foreground-muted` | `#94A3B8` | `#475569` |
| `--foreground-subtle` | `#A3B1C6` | `#52627A` |
| `--foreground-disabled` | `#64748B` | `#94A3B8` |
| `--border-subtle` | `rgba(255,255,255,0.08)` | `rgba(15,23,42,0.08)` |
| `--border-default` | `rgba(148,163,184,0.22)` | `rgba(71,85,105,0.20)` |
| `--border-control` | `#64748B` | `#64748B` |
| `--accent-primary` | `#00E5FF` | `#0284C7` |
| `--accent-secondary` | `#7C3AED` | `#7C3AED` |
| `--accent-text` | `#00E5FF` | `#0369A1` |
| `--accent-secondary-text` | `#C4B5FD` | `#6D28D9` |
| `--action-primary` | `#00E5FF` | `#0369A1` |
| `--action-primary-hover` | `#67EFFF` | `#075985` |
| `--on-action-primary` | `#070B14` | `#FFFFFF` |
| `--focus-ring` | `#00E5FF` | `#0369A1` |
| `--status-success` | `#00D68F` | `#047857` |
| `--status-success-surface` | `rgba(0,214,143,0.12)` | `#ECFDF5` |
| `--status-warning` | `#FFB020` | `#92400E` |
| `--status-warning-surface` | `rgba(255,176,32,0.12)` | `#FFFBEB` |
| `--status-danger` | `#FF5D7A` | `#BE123C` |
| `--status-danger-surface` | `rgba(255,93,122,0.12)` | `#FFF1F2` |
| `--status-info` | `#7DD3FC` | `#075985` |
| `--status-info-surface` | `rgba(125,211,252,0.10)` | `#F0F9FF` |
| `--status-unknown` | `#CBD5E1` | `#475569` |
| `--status-unknown-surface` | `#1E293B` | `#F1F5F9` |
| `--chart-cyan` | `#00E5FF` | `#0284C7` |
| `--chart-blue` | `#60A5FA` | `#2563EB` |
| `--chart-violet` | `#A78BFA` | `#7C3AED` |
| `--chart-magenta` | `#E879F9` | `#A21CAF` |
| `--chart-blue-soft` | `#7DD3FC` | `#0369A1` |
| `--chart-grid` | `rgba(148,163,184,0.12)` | `rgba(71,85,105,0.10)` |
| `--chart-axis` | `#94A3B8` | `#475569` |
| `--chart-tooltip` | `#111928` | `#FFFFFF` |
| `--chart-tooltip-foreground` | `#E6EDF7` | `#0F172A` |
| `--table-surface` | `#0F172A` | `#FFFFFF` |
| `--table-header` | `#162137` | `#F1F5F9` |
| `--table-row-hover` | `#1A2940` | `#EAF2F8` |
| `--overlay-scrim` | `rgba(7,11,20,0.72)` | `rgba(15,23,42,0.32)` |
| `--background-accent-primary` | `rgba(0,229,255,0.08)` | `rgba(2,132,199,0.05)` |
| `--background-accent-secondary` | `rgba(124,58,237,0.09)` | `rgba(124,58,237,0.05)` |
| `--background-grid` | `rgba(148,163,184,0.04)` | `rgba(71,85,105,0.04)` |
| `--glow-primary` | `rgba(0,229,255,0.12)` | `rgba(2,132,199,0.08)` |
| `--shadow-soft` | `0 8px 24px rgba(2,6,23,0.16)` | `0 8px 24px rgba(15,23,42,0.06)` |

Role aliases must include `card`, `popover`, `muted`, `primary`, `accent`,
`destructive`, their foreground counterparts, input/ring/border, semantic control
states, status/trend colours, and the existing chart-series roles. They map to the
roles above rather than introducing a second palette.

Disabled text is for genuinely inactive controls, not metadata. The 8% card edge
is decorative; control boundaries and focus indicators use contrast-tested roles.
Do not use white normal-sized text on light `--accent-primary`: that pair is about
4.10:1. White on light `--action-primary` is about 5.93:1. Dark secondary brand
violet on dark surface is about 3.13:1; use `--accent-secondary-text` for normal
text. These are opaque sRGB pair calculations, not a substitute for measuring
actual translucent composites, gradients, hover states and chart overlays.

### Geometry, layering and background

| Token | Requirement |
|---|---|
| `--radius-card` | `24px` on Card, KPI Card, Chart Card and Hero Card |
| `--radius-control` | `10px`; card radius does not apply to every button/input |
| `--glass-blur` | `20px`, including prefixed support where required |
| `--card-border` | `1px solid var(--border-subtle)` |
| `--card-hover-offset` | `-4px` for hover-capable, fine-pointer devices |
| `--duration-fast` | `150ms` |
| `--duration-standard` | `200ms`, including KPI hover |
| `--duration-slow` | `250ms` |
| `--focus-width` / `--focus-offset` | `2px` / `3px`; visible and unclipped |

Use a dark navy layered background in dark mode and a near-white counterpart in
light mode. Place a low-opacity cyan radial wash at the top right and violet at
the bottom left. Use a 32px grid with 4% line alpha; never reach 10% or use it as a
textural foreground. Decoration is inert, non-interactive and below content.

Cards use the prescribed frosted border, 24px radius and 20px backdrop blur when
supported. The soft shadow/glow distinguishes layers without a heavy floating
effect. All cards may lift on fine-pointer hover; moving a static card does not
make it clickable. Only actual links/actions get pointer cursors and keyboard
focus. Reserve cyan glow for the hovered card or active navigation, not every card
at rest. Table contents and tooltips stay sufficiently opaque regardless of the
frame's material.

Under reduced transparency, unsupported backdrop filtering, low-memory signals,
coarse pointers or constrained rendering, use opaque surfaces and remove blur.
Preserve the existing fallback capabilities while changing the visual tokens.
Do not require a new user preference solely to render readable content.

### Typography and iconography

Use locally served Inter Variable with `system-ui, sans-serif` fallback.
Headings use weight 700 and `letter-spacing: -0.03em`. Body text is 14-16px with
1.5 line height; supporting metadata is at least 12px. Page headings are 28-32px,
section headings 18-20px, primary metric values 28-36px. Use tabular numerals
for KPIs and numeric columns. Keep monospace for package/version identifiers,
not ordinary navigation or paragraph text. Existing Lucide icons remain the
cohesive line-icon family; decorative icons are hidden from assistive technology.

### Charts and motion

Use the cyan/blue/violet/magenta family with stable role mapping across themes.
Preserve both dashboard bar charts and every existing line/ranking visualization.
Bar gradients may move from a higher-alpha series colour to a lower-alpha partner;
their visible body must remain distinguishable from the plot background. Use
subtle grid lines, muted but readable axes, real zero baselines for counts,
and opaque readable tooltips. Never normalize counts or change aggregation just
to match the reference. Identifiers must be unique when multiple SVG gradients
appear on one page.

Do not encode status solely through colour. Provide chart titles, units, textual
rank/value summaries, and a keyboard-accessible way to obtain values. Under forced
colours or reduced transparency, prefer solid distinguishable marks and labels.

Microinteractions last 150-250ms; KPI lift/glow lasts 200ms. The hero's decorative
gradient performs one subtle reveal of at most four seconds and then settles.
An optional healthy-status pulse is limited to two cycles, then becomes steady.
There is no indefinite ambient animation behind operational content. Reduced
motion disables translation, pulses, shimmer travel and gradient movement.
Theme changes may fade colours for 200ms after hydration, never flash an incorrect
theme, animate every descendant, or delay input response.

## Reusable Component Contracts

These are behavior/composition contracts, not mandatory new wrappers around every
existing component.

| Component | Responsibilities | Non-responsibilities |
|---|---|---|
| Card | Shared geometry, themed material, border, padding and optional interactive presentation | Fetching data, routing or inventing click targets |
| KPI Card | Icon, formatted value, label, truthful context, optional supported trend, state handling | Generating random trends or treating errors as zero |
| Chart Card | Title, scope, optional real destination action, plot region, summary, loading/empty/error states | Re-aggregating or removing source data |
| Hero Card | Overview title, four supported metrics, reporting-health badge, inert gradient | Claiming service uptime or broad system availability |
| Application shell | Header, navigation, main landmark, skip link, responsive drawer | Replacing the API/authentication architecture |
| Status badge | Text, semantic icon/colour, clear scope | Equating a security update with an unresolved vulnerability |

Extend or adapt existing Card/StatsCard/BarChart/LineChart implementations where
appropriate. Introduce new components only for reusable composition; preserve
prop compatibility or migrate every production caller deliberately.

## Functional Requirements

All FR items are **Must** for R1. The common actor is an operator; the requirement
states the trigger and observable outcome. Each row links to an acceptance
criterion and product goal.

| ID | Requirement | Acceptance | Goal |
|---|---|---|---|
| FR-001 | When choosing light, dark or system preference, the operator shall see the selected theme persist across reloads and navigation. | AC-001 | GOAL-002 |
| FR-002 | On every existing/new page, the operator shall receive the same responsive header, navigation and main-content landmarks. | AC-002 | GOAL-001 |
| FR-003 | When following a navigation link or existing deep link, the operator shall reach its preserved function with the correct active destination. | AC-003 | GOAL-003 |
| FR-004 | When opening global search, the operator shall navigate pages/hosts or submit a package lookup using only current data services. | AC-004 | GOAL-001 |
| FR-005 | On the dashboard, the operator shall see the four supported overview measurements defined in the data table. | AC-005 | GOAL-003 |
| FR-006 | When host data changes or becomes unavailable, the operator shall receive the reporting-health state specified by the truth table. | AC-006 | GOAL-003 |
| FR-007 | On the dashboard, the operator shall see KPI cards for hosts, recent updates, weekly updates and reporting-health counts. | AC-007 | GOAL-001 |
| FR-008 | When reading a dashboard or existing route chart, the operator shall retain its current data and visualization with the new cohesive presentation. | AC-008 | GOAL-003 |
| FR-009 | When inspecting recent updates, the operator shall retain host, package, old/new version, time and security-tag meaning. | AC-009 | GOAL-003 |
| FR-010 | When refreshing or navigating, the operator shall retain current query/filter/export semantics and the recent-update refresh interval. | AC-010 | GOAL-003 |
| FR-011 | On Reports, the operator shall filter and export a bounded activity report using existing aggregate and security data. | AC-011 | GOAL-004 |
| FR-012 | On Alerts, the operator shall inspect current attention signals and open their existing operational destinations. | AC-012 | GOAL-004 |
| FR-013 | When a source is loading, empty, stale, denied or failing, the operator shall see a truthful state scoped to that source. | AC-013 | GOAL-003 |
| FR-014 | When consuming a reusable card, the interface shall apply the shared token/component contract rather than route-local colour values. | AC-014 | GOAL-002 |
| FR-015 | When using the interface without a pointer, the operator shall complete all release-critical flows with visible focus. | AC-015 | GOAL-002 |
| FR-016 | When viewing supported viewport/zoom configurations, the operator shall retain readable content and reachable controls without page-level overflow. | AC-016 | GOAL-002 |
| FR-017 | When reduced motion or constrained rendering is active, the operator shall receive the specified static or opaque alternatives. | AC-017 | GOAL-002 |
| FR-018 | When reading the header, the operator shall encounter only functional controls backed by current capabilities. | AC-018 | GOAL-003 |
| FR-019 | When seeing comparison or status copy, the operator shall receive its real source/window and no unsupported trend or availability claim. | AC-019 | GOAL-003 |

### Reports: bounded frontend composition

Create `/reports` using the existing activity aggregates and security feed/export.
Provide explicit time range, host, package and supported event filters, with
shareable URL state. Default to the last seven days and daily buckets. Show
aggregate updates/installs/upgrades/security/kernel counts with their window;
reuse the existing activity line chart and accessible summary. Provide drill-down
links to Activity, Hosts and Security carrying only parameters those views accept.

CSV/JSON activity exports use the existing export mechanism and export the
returned buckets, not claimed raw package rows. Security exports use the existing
server-export route and its 10,000-row cap. Label scope, bucket size, row count and
any cap/truncation. Partial-source failure leaves other report sections usable.
No PDF engine, schedules, persisted report definitions or report permissions are
introduced. Existing Activity and Security remain independently accessible.

### Alerts: current attention signals, not incidents

Create `/alerts` as a read-only triage surface for these actual signals:

- Missing and stale package reporters, from the current host-health helper.
- Ingest rejections, from authorized ingest diagnostics.
- Failed webhook deliveries, from authorized webhook coverage.

Show signal type, affected host or aggregate event type, reported count,
source/window, fetch freshness and an actionable destination. Host signals open
the host detail or filtered host list; ingest signals open Diagnostics; webhook
signals open Webhooks/Diagnostics without inventing per-delivery records from an
aggregate. Sort missing before stale, and show delivery/ingest failures in their
own clearly scoped categories rather than pretending they share one severity SLA.

Derive a view-local key from signal type and source identity only for stable UI
rendering; it is not a persisted incident ID. Filters are frontend/URL state.
No acknowledgement, resolve, snooze, dispatch, saved rule, browser notification,
historical incident timeline or notification-inbox behavior is implied.
Security-tagged updates remain events in Security, not assertions of open CVEs.
If admin sources deny access, show their unavailable/permission state while keeping
host-reporting signals usable; the frontend must not bypass existing authorization.

## Non-Functional Requirements

| ID | Category | Requirement and release evidence |
|---|---|---|
| NFR-001 | Usability/accessibility | WCAG 2.2 AA: normal text >=4.5:1, large text >=3:1, meaningful UI/graphic boundaries >=3:1 where required; verify actual composites in both themes. Decorative card borders/grid are not control boundaries. |
| NFR-002 | Usability/accessibility | All actions have accessible names; skip navigation works; drawers/dialogs manage and restore focus; no keyboard trap; targets are 44px where practical and never below WCAG 2.2 AA target-size rules without an applicable exception. |
| NFR-003 | Compatibility | Verify current Chrome, Edge, Firefox and Safari at release, including iOS Safari; document tested versions. Opaque fallbacks must work with unsupported filters and forced colours. |
| NFR-004 | Performance/capacity | Relative to the same-device pre-redesign fixture run, median LCP may regress by at most 10% or 200ms, whichever is greater, and CLS must remain <=0.1; use five cold-load runs with fixed data/network conditions. This is an acceptance budget, not a measured result. |
| NFR-005 | Performance/capacity | No new continuous polling on existing routes; preserve the current 30-second recent-update interval. Reports/Alerts use shared caches and explicit refresh; loading the shell must not fetch all route datasets or load chart bundles eagerly. |
| NFR-006 | Reliability/resilience | Preserve independently successful sections during partial failures; unavailable data must not become zero/healthy; show last-success time when presenting cached data after failure. |
| NFR-007 | Security | Keep API credentials in existing server-side proxies. Do not expose secrets, broaden authorization, include admin-only data in global search, or make telemetry/search capture raw credentials. |
| NFR-008 | Privacy | No new identity, profile or notification data collection. Do not add raw search terms, hostnames or report exports to analytics beyond the existing approved telemetry contract. |
| NFR-009 | Maintainability/operability | One token source feeds theme aliases and shared primitives. No new UI framework or charting-library replacement is needed. Theme/source tests must assert approved contracts rather than component comments or helper call syntax. |
| NFR-010 | Observability | Preserve existing page, theme, refresh and API instrumentation; new frontend destinations follow existing instrumentation patterns without treating performance samples as fleet uptime or SLA data. |
| NFR-011 | Portability | Self-host Inter Variable with the app and preserve container/runtime configuration. Rendering must not depend on a third-party font CDN, reference-image host, or live design-tool service. |
| NFR-012 | Scalability | Search only current host/cache data and explicitly submitted package queries; report/export behavior respects current API limits and shows truncated scope instead of asserting whole-fleet completeness. |

## Constraints

| ID | Constraint | Source / boundary / acceptance consequence |
|---|---|---|
| CON-001 | No backend logic, database or ingestion changes | User; technical boundary; any missing capability is deferred, not simulated |
| CON-002 | No removed current functionality, routes or visualizations | User; release scope; execute a route/workflow parity checklist |
| CON-003 | Supplied dark/light foundations, Inter, card geometry and reference language remain binding | User; visual boundary; review both themes against the image with documented data substitutions |
| CON-004 | Only existing APIs supply Reports, Alerts and global-search results | Confirmed user decision; integration boundary; no new backend endpoint or auth rule |
| CON-005 | Accessibility and truthful data take precedence over decorative transparency or sample copy | User AA/preservation requirements; release acceptance; use role variants and opaque fallbacks rather than false measurements |

## Acceptance Criteria and Traceability

All criteria are **Not Started** for UI implementation. A PRD or passing old test
suite does not establish that any criterion is complete. The following matrix
provides both FR-to-AC coverage and FR-to-GOAL alignment: 19/19 requirements have
criteria and goal links (100% each); this is document coverage, not test pass rate.

| ID | Given / When / Then | Covers | Goal |
|---|---|---|---|
| AC-001 | Given system/light/dark preferences, when toggling, reloading and navigating, then every surface preserves the chosen effective theme without a wrong-theme flash or hydration warning. | FR-001 | GOAL-002 |
| AC-002 | Given each current route plus Reports/Alerts, when opening it on desktop/mobile, then header, rail/drawer, skip link and main landmark remain consistent and content is not covered. | FR-002 | GOAL-001 |
| AC-003 | Given saved current URLs and rail destinations, when following each, then its original function remains reachable and only its actual navigation item is current. | FR-003 | GOAL-003 |
| AC-004 | Given keyboard or pointer input, when searching pages, a known host, an unknown name and a package containing URL-special characters, then results/status are accurate, destinations preserve the query, and Escape restores focus. | FR-004 | GOAL-001 |
| AC-005 | Given known stats values including zero and a long number, when rendering either theme, then the hero shows exactly the four supported values with the specified labels/windows and no uptime/latency substitutions. | FR-005 | GOAL-003 |
| AC-006 | Given fixtures for every health truth-table row and timestamps at exactly 30/365 days and just beyond, when rendering, then badge/counts/copy match the current helper and unknown/empty/error never reads Healthy. | FR-006 | GOAL-003 |
| AC-007 | Given loaded stats/host data, when reading the KPI row, then all four defined KPIs and both stale/missing counts are available; unsupported percentages are absent and fine-pointer hover uses the 200ms treatment. | FR-007 | GOAL-001 |
| AC-008 | Given baseline datasets for every existing chart, when rendering the redesign, then ranks, labels, values and drill-down meaning are preserved; chart summaries expose the same data without colour or hover alone. | FR-008 | GOAL-003 |
| AC-009 | Given install, upgrade and security-tagged records, when inspecting the recent table at mobile/desktop sizes, then host/package, old/new versions, timestamp and security meaning remain accessible with opaque rows. | FR-009 | GOAL-003 |
| AC-010 | Given current refresh/filter/export flows, when using the redesigned controls, then outcomes, URL state, export caps, time windows and recent-update interval match their current contracts. | FR-010 | GOAL-003 |
| AC-011 | Given activity/security data for a selected host/date range, when opening/filtering/exporting Reports, then totals/charts/files reflect the returned data, applied scope and cap, with working existing-route drill-downs. | FR-011 | GOAL-004 |
| AC-012 | Given missing/stale hosts, rejected ingest counts and failed webhook coverage, when opening/filtering Alerts, then actual signals and source/window labels appear with valid operational links and no invented incident actions. | FR-012 | GOAL-004 |
| AC-013 | Given independently loading/empty/denied/failed sources and a failed refresh with cached data, when rendering, then each region has its specified state, usable retry/context, and no success-shaped fallback. | FR-013 | GOAL-003 |
| AC-014 | Given all Card/KPI/Chart/Hero consumers, when inspecting both themes, then shared tokens supply the specified colour/geometry/material roles without new route-local colour literals. | FR-014 | GOAL-002 |
| AC-015 | Given keyboard-only and screen-reader operation, when completing the five pilot tasks, then names/order/focus/dialog behavior and chart values are usable, with no static-card tab stops. | FR-015 | GOAL-002 |
| AC-016 | Given 320, 390, 768, 820, 1024 and 1440 CSS-pixel widths plus 200% zoom and 400% reflow checks, when traversing content, then navigation/search/actions remain reachable, cards/charts do not collide, and wide tables scroll within their own region. | FR-016 | GOAL-002 |
| AC-017 | Given reduced-motion, reduced-transparency, forced-colours, unsupported-filter and constrained-device settings, when interacting, then corresponding animations/blur are removed and content/focus/values remain readable. | FR-017 | GOAL-002 |
| AC-018 | Given no profile or inbox service, when rendering the header, then no fake avatar, notification badge or inert account/notification control appears. | FR-018 | GOAL-003 |
| AC-019 | Given sample reference numbers and unavailable comparison/service metrics, when rendering production data, then no sample trend, uptime, response-time or broad system-health claim is presented as measured. | FR-019 | GOAL-003 |

## MVP and Implementation Sequencing

1. **Foundation:** capture baseline route/data fixtures and representative
   screenshots in both themes; introduce semantic tokens and font delivery;
   preserve API/auth and instrumentation paths.
2. **Shell:** implement rail/header/search/theme behavior and responsive drawer;
   verify every existing destination and deep link.
3. **Dashboard:** adapt reusable Card/KPI/Chart/Hero contracts; migrate real stats,
   health, both bar charts and recent updates; verify partial-source states.
4. **Expansion:** add frontend Reports and Alerts, with current API scopes,
   permissions, export caps, source freshness and drill-down links.
5. **Parity and release:** theme every existing route, verify all visualizations,
   run accessibility/performance/contract checks, and review both theme captures
   against the supplied reference before enabling the redesign.

Each increment must keep the application runnable. No backend dependency belongs
on the R1 critical path. Do not ship a half-migrated palette or inaccessible
secondary route under a finished-looking dashboard.

## Success Metrics and Measurement Plan

| Metric | Baseline | Target | Window / source / owner |
|---|---|---|---|
| Five-task unassisted completion | Not measured; capture current UI before implementation | >=90% task completion in >=5-person pilot | Before release; moderated checklist; product/design owner |
| Route and visualization parity | Current route/data checklist | 100% retained | Release gate; fixture-backed browser checks; engineering owner |
| Theme/accessibility coverage | Existing glass source tests are incomplete evidence | All critical states pass both-theme/keyboard/contrast checks | Release gate; browser, manual and automated checks; accessibility/QA owner |
| Unsupported measurement claims | Current source lacks uptime/latency inputs | Zero fabricated metrics, comparisons or notification states | Release gate and first two weeks; product review |
| Reports/Alerts task completion | Pages do not exist | All AC-011/AC-012 scenarios pass | Release gate; deterministic fixture-backed flows; engineering/QA owner |
| Loading stability and performance | Establish on the agreed fixed test device/network | NFR-004 budget met | Five runs before/after; browser tooling; frontend owner |

Owners are required roles, not confirmed named assignees. Do not record targets
as achieved measurements.

## Risks, Assumptions and Open Decisions

| ID | Risk / assumption | Status and mitigation |
|---|---|---|
| RISK-001 | Repeated 20px backdrop blur may be costly on mobile/low-memory devices | Medium probability/high impact; measure before/after and use explicit opaque fallbacks |
| RISK-002 | Transparent surfaces can undermine contrast over gradients/charts | High probability/high impact; verify actual composites; keep tables/tooltips opaque |
| RISK-003 | "Healthy" and "Alerts" can overstate what package reports prove | High impact; apply scoped reporting copy and read-only signal semantics |
| RISK-004 | Existing source-contract tests pin the superseded palette, blur and component spellings | Evidenced; update only intentionally replaced visual contracts during implementation; retain independent safety/accessibility tests |
| RISK-005 | Admin diagnostics are unavailable to some deployments/users | Partially supported; degrade individual Alerts categories without weakening authorization |
| RISK-006 | All-host response completeness and aggregate windows may differ from operator assumptions | Verify against current contracts; expose actual scope/limits; do not infer a complete fleet or period from truncated results |
| ASSUMPTION-001 | Existing infrastructure operators are the primary audience | Inferred from repository, not user research; validate in the pilot |
| OPEN-001 | Named release owner, reviewers, schedule and pilot participants | Assign before implementation kickoff; no invented commitments |
| OPEN-002 | Exact deployment/API version matches the local source | Unverified; live access blocked; compare an authorized deployment screenshot/schema before release |

Resolved scope questions: existing metrics replace unsupported hero/trend data;
account and inbox features are deferred; Reports/Alerts are frontend-only; existing
routes remain. These are not open implementation choices.

## Validation and Preservation Strategy

At implementation time, retain current executable sanitizer, auth, validation,
storage/projection and export contracts. Intentionally replace obsolete visual
token assertions rather than deleting unrelated proof to make the redesign pass.
Avoid tests of comments, exact helper call syntax or duplicate class-name checks.

Add behavior-level proof at the strongest practical boundary: real component/
browser interactions with deterministic API fixtures for navigation, search, theme
persistence, health states, partial errors, charts, reports and alerts. Use the
existing native Node suites for their appropriate shared contracts; select any
additional browser tooling explicitly during implementation rather than treating
this PRD as permission to install a new stack now.

Collect one batched desktop/mobile, light/dark visual review, fix material defects
together, then perform one confirmation round. Include empty and error screenshots,
not only the populated happy path. A screenshot match never substitutes for data,
keyboard, fallback or preservation evidence.

## Glossary

| Term | Meaning in this release |
|---|---|
| Reporting health | Host package-report recency, using current 30/365-day boundaries |
| Security update | A package event tagged by the reporting host/security channel, not a confirmed open vulnerability |
| Alert signal | A current observed reporting/ingest/delivery condition; not a persisted incident |
| Report | A filtered view/export over existing activity/security responses |
| Freshness | When the interface last successfully fetched a source, distinct from the event/report time |
| Glass frame | Frosted outer card material; not permission to make data-table rows transparent |

## Sign-Off and Handoff Readiness

Status: **Draft; pending product, frontend and accessibility/QA review.**
The two user scope answers above are recorded decisions, not approval of the
entire PRD. No waivers or implementation-completion claims exist.

Before approval: assign owners, confirm API/deployment compatibility and report
scopes, review the token roles against actual composites, agree the baseline
measurement setup, and accept the route/data parity checklist. Formal PRD quality
review and release acceptance have not yet been performed. This document supplies
implementation requirements; it does not authorize backend scope expansion.

## Document Metadata

Structure adapted from the Microsoft HVE-Core requirements-author PRD template
(CC BY 4.0). Product-specific requirements, visual specification and decisions are
authored for Fluxion. No BRD, feasibility handoff, or third-party product audit was
supplied; no external benchmark or certification is claimed.
