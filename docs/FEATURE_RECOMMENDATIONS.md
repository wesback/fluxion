# Fluxion — Views & Feature Recommendations

Product-minded recommendations for views and features that fit Fluxion as a multi-host Linux package update tracking system.

**Captured:** 2026-07-23  
**Context:** Dashboard, Hosts, Packages search, Admin (API keys/webhooks), APT hooks, and kernel/security webhook events already exist.

---

## Current product surface

| Area | Today |
|------|--------|
| **Dashboard** | Totals, 24h/7d, top packages/hosts, recent stream |
| **Hosts** | List + detail + recent history chart |
| **Packages** | Search → “which hosts have this package” |
| **Admin** | API keys, webhooks (`kernel_update`, `security_update`, etc.) |
| **Ingest** | APT hook with `is_security` detection |

### Important gap

`is_security` is accepted by the API/hook and used for webhooks, but **not stored** on `package_updates` and **not shown** in the UI. Several high-value views start by closing that loop.

---

## Highest-value new views

### 1. Security feed (`/security`)

A first-class “what just got patched for security?” page.

- Filterable table of security-flagged updates (host, package, versions, time)
- Stats: security updates last 24h / 7d, top security packages, hosts with most security patches
- Badge in global recent updates (“Security”)
- Deep link from webhook payload / ntfy

This is the natural productization of work already in the hook + webhook path.

### 2. Fleet health / silent hosts (`/hosts` enhancement or `/health`)

Ops care as much about **hosts that stop talking** as about updates that arrive.

- Status: healthy / stale / missing (e.g. last seen &lt; 24h / 7d / never)
- Sort by `last_seen` with red/amber badges
- “Hosts with zero updates in N days” (patching lag vs reporting lag)
- Optional webhook: `host_stale` after threshold

### 3. Version drift / consistency (`/drift` or package detail)

Package search answers “where is X?” Drift answers “**are we aligned?**”

- Pick a package → version histogram across hosts
- Highlight outliers (one host still on old `openssl`)
- “Expected version” or “newest seen” as baseline
- Group by OS when versions aren’t comparable across distros

### 4. Package detail page (`/packages/[name]`)

Upgrade search results from a flat table to a real entity page:

- Version distribution chart
- Timeline of that package’s updates fleet-wide
- Host list with current version + last updated
- Install vs upgrade counts
- Link into security feed if any updates were security-flagged

### 5. Activity timeline (`/activity` or dashboard panel)

Beyond “last 20 rows”:

- Time-series of updates/day (fleet + per host)
- Heatmap (day × hour) for patch windows
- Burst detection (“unattended-upgrades just hit 40 packages on 12 hosts”)
- Filters: host, package prefix, security-only, kernel-only

### 6. Kernel fleet (`/kernels`)

Kernel packages are already special-cased for webhooks. Surface that:

- Latest `linux-image*` / headers per host
- “Kernel updated recently” list
- Optional later: **reboot required** (needs a small agent heartbeat field — big jump in value for operators)

---

## Features that improve existing views

### Filtering & query power (cross-cutting)

Almost every page needs the same primitives:

- Host / OS / package / date range / install vs upgrade / security / kernel
- URL-query-driven filters (shareable ops links)
- CSV/JSON export of the current result set
- Global search in the navbar (host **or** package)

### Host organization

With more than a handful of machines:

- **Tags / groups / environments** (`prod`, `lab`, `k8s-workers`)
- Filter dashboard stats by group
- Webhook filters by tag (only alert prod kernel updates)

Schema-wise this is a small join table or tags array on `hosts`, huge UX win.

### Install vs upgrade clarity

Install sentinels are already normalized (`old_version` → null). Make it visible:

- Badge: **Install** / **Upgrade** / **Security** / **Kernel**
- Dashboard split: installs vs upgrades last 24h
- Host detail filter for “new packages only” (surprise software)

### Watchlists & saved views

- Watch packages: `openssl`, `openssh-server`, `containerd`, kernels
- “My views”: e.g. “prod + security + last 7d”
- Optional webhook event: `watched_package_update`

### Diff hosts

- Compare host A vs host B for shared packages with different versions
- Or “this host vs group median”

Useful after clone drift or partial rollouts.

### Live mode

Recent updates already poll every 30s. Stronger options:

- SSE/WebSocket “live feed” with pause/filter
- Browser notifications for security/kernel when the tab is open
- Soundless “pulse” indicator when fleet is actively patching

---

## Dashboard upgrades (same route, more signal)

Keep `/` as the ops home, but add:

| Card / panel | Why |
|--------------|-----|
| **Security updates (24h)** | Separate noise from risk |
| **Stale hosts** | Detect broken hooks/API keys |
| **Kernel events (7d)** | Already a first-class event type |
| **OS distribution** | Pie/bar of `os_info` |
| **Update volume sparkline** | Trend, not just counters |
| **Quiet hosts with old packages** | Patch debt, not just activity |

Right now the dashboard optimizes for “who is busiest,” which can be the opposite of “who is at risk.”

---

## Admin / platform features

- **Retention policy**: auto-prune updates older than N days (tables grow fast with unattended-upgrades)
- **Host decommission**: soft-delete / archive + hide from fleet health
- **Ingest diagnostics**: last successful report per API key, failed hook samples, rate-limit hits
- **Webhook event coverage UI**: clear matrix of `package_update` / `package_install` / `kernel_update` / `security_update` / (future) `host_stale`
- **Read-only UI auth** (even simple shared secret / OIDC) if the dashboard is internet-facing
- **Multi-distro agents**: dnf/yum, apk, zypper — same API, different hooks (expands addressable fleet)

---

## Suggested build order

1. **Persist + display `is_security`** (model, migration, query API, badges, `/security`)
2. **Silent/stale host health** on Hosts + dashboard card
3. **Package detail + version drift**
4. **Richer filters + export** everywhere
5. **Host tags/groups**
6. **Kernel fleet view** (+ reboot-needed later if you add agent heartbeat)
7. **Watchlists + more webhook event types**
8. **Retention + decommission** for long-lived prod use

---

## Explicit non-priorities (early)

- Full CMDB / inventory replacement (installed package dump every day) — huge storage, different product
- Automated patch orchestration (that’s Ansible/Landscape/unattended-upgrades territory)
- Fancy AI “risk scores” before basic security + drift + silent-host signal exists

---

## Product thesis

Fluxion is strong as an **event log of package changes**. The biggest product leaps are turning that log into:

1. **Risk views** — security, kernel, silent hosts  
2. **Fleet consistency views** — drift, package detail, tags  
3. **First-class filters/export** — so operators can answer “what changed, where, and is that a problem?” without grepping tables  

### Best first implementation slice

Security feed + `is_security` persistence (schema → API → UI badges → `/security` page).
