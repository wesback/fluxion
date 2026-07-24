# Project Context

- **Owner:** Wesley Backelant
- **Project:** fluxion
- **Created:** 2026-07-11T00:05:53.066+02:00
- **Focus:** Linux package-update tracking through APT hooks.
- **Application stack:** FastAPI/Python, SQLAlchemy, PostgreSQL, Next.js/React.
- **Platform:** Azure AKS, Terraform, Helm, ArgoCD, and CI/CD.

## Learnings

- Morpheus owns the Next.js/React dashboard, visual UX, and API integration.
- The dashboard must communicate package-update state clearly and accessibly.

## 2026-07-24: iPad "menu doesn't render clean" — navbar breakpoint fix

Wesley reported the UI doesn't render clean on his iPad, especially the
menu, with no screenshots or logs — just "go find it."

**Investigation:** Started the frontend dev server and drove it with
Playwright at the full iPad target matrix (768×1024, 820×1180,
1024×1366 portrait; 1024×768, 1180×820, 1366×1024 landscape). Read
`components/navbar.tsx`, `app/layout.tsx`, `app/globals.css`, and the
existing UI contract tests before touching anything.

**Root cause, confirmed with evidence (screenshots + DOM
measurement):** the navbar switched from the hamburger drawer to a
full horizontal nav at Tailwind's `md:` breakpoint (768px) — exactly
iPad mini/9th-gen portrait width. With 7 nav items (some carrying
icons) plus the logo and theme toggle, the horizontal nav did not fit
at 768px or 820px (iPad Air/Pro 11" portrait): text wrapped to a
second line and overlapped adjacent links and the theme toggle
button. Measured the theme toggle button rendering ~47px past the
viewport's right edge at 768px width. At 1024px width the same nav
rendered cleanly with ~200px to spare, so 1024 (`lg:`) is the
narrowest width in the matrix that actually fits.

**What I checked and found already correct (left alone):** no
hover-only affordances anywhere (mobile menu already opens on
click/tap, and `.navbar-frosted` already had a `@media (pointer:
coarse)` fallback disabling blur for touch); no `100vh` usage anywhere
in `globals.css` or `layout.tsx`; wide tables already wrap in an
`overflow-auto` container (`components/ui/table.tsx`) so they can't
push the page width; recharts already uses `ResponsiveContainer
width="100%"` inside sized parents; icon-only buttons already meet
44×44 CSS px touch targets (`Button` `size="icon"` is `h-11 w-11`, the
hamburger has explicit `min-h-11 min-w-11`); the default Next.js
viewport meta was already `width=device-width, initial-scale=1` with
no zoom lock; `-webkit-backdrop-filter` was already paired with
`backdrop-filter` throughout.

**Fix applied:**
- `components/navbar.tsx`: changed the nav's compact/full switch from
  `md:` (768px) to `lg:` (1024px) — the drawer now holds through both
  iPad portrait widths and only switches to horizontal nav at 1024px
  and above, where it measured clean.
- `app/layout.tsx`: added a proper `export const viewport: Viewport`
  with `viewportFit: "cover"` so `env(safe-area-inset-*)` is available;
  deliberately did not set `maximumScale`/`userScalable` (accessibility
  floor, and it wouldn't have fixed the layout anyway).
- `app/globals.css`: padded `.navbar-frosted` with
  `env(safe-area-inset-left/right)` so the fixed nav clears the
  rounded corners in landscape iPad orientations.
- `tests/frosted-glass-contract.test.mjs`: added regression guards —
  nav must switch at `lg:` not `md:`, mobile toggle/panel match,
  `.navbar-frosted` carries the safe-area padding, viewport sets
  `viewport-fit: cover` without a zoom lock, and no raw `100vh`
  anywhere in the shell.

**Verification:** `npm run lint` clean, `npm run build` exit 0,
`npm run test:ui-contract` 75/75 passing, `npm run test:frosted-glass`
67/67 passing (61 existing + 6 new). Playwright screenshots taken
before/after at all six matrix viewports; confirmed zero horizontal
overflow (`document.documentElement.scrollWidth === window.innerWidth`)
at every one after the fix, versus visible wrapping/overlap and DOM
elements rendering past the viewport edge before it.

**Left alone / flagged for a real device:** the API calls
(`/api/stats`, `/api/hosts`, `/api/updates/recent`) returned 500s in
the local dev environment throughout testing (a "Server configuration
error" toast appeared on every page) — that's a backend/config issue,
not a frontend layout bug, and out of my scope; flagging for Trinity.
Also didn't add outside-tap-to-close or focus trapping to the mobile
menu panel since it's a static inline drawer that pushes content down
(not a modal/overlay), so those overlay-specific behaviors don't
apply; it already closes on nav-link click via `handleNavClick`.

**Environment note:** the Playwright MCP browser tool needed a Chrome
binary at `/opt/google/chrome/chrome`, which wasn't present and can't
be installed via the bundled Ubuntu/Debian-only installer scripts on
this Fedora host. Symlinked the already-downloaded Playwright Chromium
build (`~/.cache/ms-playwright/chromium-1217/...`) to that path via
`sudo ln -sf` to unblock verification — a system-level fix outside the
repo, left in place since it's additive and enables future Playwright
use in this environment.

Wrote a team-wide decision to
`.squad/decisions/inbox/morpheus-ipad-navbar-breakpoint.md`: treat
`md:` (768px) as unsafe for compact→full nav switches when iPad
portrait widths (768–820px) are in the support matrix; prefer `lg:`
(1024px) unless an item count is measured to fit at `md:`.
