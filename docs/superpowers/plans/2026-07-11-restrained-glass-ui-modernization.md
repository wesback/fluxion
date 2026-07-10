# Restrained Glass UI Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved restrained-glass visual system to Fluxion while preserving operational-data readability, accessibility, and opaque data tables.

**Architecture:** Define one semantic glass contract in `app/globals.css`, then consume its single `.glass-surface` class in shared surface primitives and selected route shells. The table primitive owns an opaque, suffix-important fill contract and sanitizes caller background utilities so pages cannot accidentally make data tables translucent. Native Node tests verify source-level styling contracts because the frontend has no existing test runner or test files; existing lint and production build remain the integration gates.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Recharts, Node.js built-in test runner, ESLint.

---

## File structure

### Create

- `frontend/tests/restrained-glass-contract.test.mjs` — Node built-in static contract tests for token values, fallback selectors, table locked classes/sanitization, and shared component adoption.
- `frontend/tests/without-table-surface-utilities.test.mjs` — executable native Node adversarial behavior tests for the table-surface sanitizer.
- `frontend/lib/without-table-surface-utilities.mjs` — framework-independent, native-Node-importable sanitizer for caller-supplied Tailwind background utilities.
- `frontend/components/charts/glass-tooltip.tsx` — shared Recharts tooltip renderer that applies the only reusable `.glass-surface` treatment.

### Modify

- `frontend/package.json:5-10` — expose the native contract test command without adding dependencies.
- `frontend/app/globals.css:3-95` — add approved tokens, Tailwind mappings, `.glass-surface`, transparency fallbacks, and constrained-rendering behavior.
- `frontend/components/ui/card.tsx:4-17` — make the shared card the standard glass frame.
- `frontend/components/ui/table.tsx:1-117` — import the sanitizer and enforce opaque table fills.
- `frontend/components/ui/dialog.tsx:57-109` — make dialog content a glass surface while retaining overlay, Escape, and close-button behavior.
- `frontend/components/ui/button.tsx:10-38` — use the control-border token for visible outline controls.
- `frontend/components/ui/input.tsx:4-22` — use the input-border token and opaque readable control fill.
- `frontend/components/ui/textarea.tsx:4-18` — align textarea borders/fill with `Input`.
- `frontend/components/ui/select.tsx:9-28` — align select borders/fill with `Input`.
- `frontend/components/ui/skeleton.tsx:14-71` — align statistics/chart loading surface framing with the glass system without changing status semantics.
- `frontend/components/navbar.tsx:31-115` — apply the shared glass treatment to desktop and mobile navigation surfaces.
- `frontend/components/charts/bar-chart.tsx:3-79` — replace inline tooltip surface styling with the shared glass tooltip.
- `frontend/components/charts/line-chart.tsx:3-51` — replace inline tooltip surface styling with the shared glass tooltip.
- `frontend/app/page.tsx:68-152` — apply the glass frame to dashboard error states; keep `UpdatesTable` unchanged and opaque.
- `frontend/app/hosts/page.tsx:54-116` — apply glass to the search/error surface while retaining the current responsive table.
- `frontend/app/hosts/[hostname]/page.tsx:53-157` — apply glass to host error/not-found/chart-error surfaces without changing loading/table behavior.
- `frontend/app/packages/page.tsx:37-121` — apply glass to search, error, and empty-result surfaces while retaining the result table.
- `frontend/app/admin/layout.tsx:23-50` — apply glass framing to admin navigation without changing active-link semantics.
- `frontend/app/admin/api-keys/page.tsx:109-303` — apply glass to API-key error and dialog surfaces; leave the table governed by `Table`.
- `frontend/app/admin/webhooks/page.tsx:134-213,230-280,370-700` — apply glass to webhook forms/state panels/dialogs and change direct checkbox border to `border-control-border`.

### Deliberately unchanged

- `frontend/app/layout.tsx:19-50` — retains providers, skip navigation, main landmark, and toast placement.
- `frontend/app/admin/page.tsx:1-5` — remains a redirect.
- `frontend/components/stats-card.tsx:17-46`, `frontend/components/host-card.tsx:12-31`, and `frontend/components/updates-table.tsx:19-71` — inherit the Card surface; retain their existing content, hover behavior, and table composition.
- `frontend/components/theme-toggle.tsx:13-49` — retains system/light/dark selection and accessible label behavior.

## Task 1: Establish executable styling-contract tests

**Files:**
- Create: `frontend/tests/restrained-glass-contract.test.mjs`
- Modify: `frontend/package.json:5-10`

- [ ] **Step 1: Write failing native Node tests before styling code**

  Create a `node:test` suite that reads frontend source files from the repository. Group assertions into named `node:test` cases (`tokens and transparency fallback`, `shared primitive adoption`, `opaque table source contract`, and `route adoption`) so later tasks can execute only the contract group they have made green. Do not import the sanitizer in this initial suite: its module is intentionally created in Task 4 before the dedicated runtime test file imports it. Add focused static assertions for:
  - the exact light/dark values of all approved glass/control tokens;
  - `.glass-surface` using both standard and WebKit backdrop filters plus the approved two-layer shadow;
  - the media selector and both root fallback selectors with opaque card fill and no filters;
  - the exact constrained-rendering media query and opaque `--glass-opaque` fill;
  - Tailwind v4 suffix-important opaque Table/Header/Body/Row/Footer class strings;
  - use of `withoutTableSurfaceUtilities` for every required table primitive once Task 4 imports it;
  - Card, Navbar, Dialog, and both charts consuming `.glass-surface` rather than a second blur/opacity treatment.

- [ ] **Step 2: Add a test script and verify red**

  Add `"test:ui-contract": "node --test tests/*.test.mjs"` to `frontend/package.json`. At this point the glob resolves only to `restrained-glass-contract.test.mjs`; Task 4 adds the sanitizer's dedicated behavior test.

  Run: `cd frontend && npm run test:ui-contract`  
  Expected: FAIL on missing token/fallback/component source-contract assertions; it must not fail from importing a not-yet-created sanitizer module.

- [ ] **Step 3: Commit the test harness**

  ```bash
  git add frontend/package.json frontend/tests/restrained-glass-contract.test.mjs
  git commit -m "test: define restrained glass contracts"
  ```

## Task 2: Define the approved token and fallback contract

**Files:**
- Modify: `frontend/app/globals.css:3-95`
- Test: `frontend/tests/restrained-glass-contract.test.mjs`

- [ ] **Step 1: Extend the failing test with control-border and fallback assertions**

  Require `--color-control-border` and `--color-input-border` mappings, the exact `12px` blur maximum, and matching declarations for media, `html[data-reduced-transparency="true"]`, and `html.reduced-transparency` fallbacks.

- [ ] **Step 2: Run the focused test**

  Run: `cd frontend && npm run test:ui-contract`  
  Expected: FAIL with the missing token/style assertion.

- [ ] **Step 3: Implement tokens and the sole reusable surface**

  In both `:root` and `.dark`, add exactly these tokens and values from the approved specification:

  ```css
  --glass-surface; --glass-surface-alpha; --glass-border; --glass-border-alpha;
  --glass-shadow; --glass-shadow-near-alpha; --glass-shadow-alpha; --glass-blur;
  --glass-opaque; --control-border; --input-border;
  ```

  Map `--color-control-border` and `--color-input-border` in `@theme inline`. Add exactly one `.glass-surface` class with the approved alpha background, alpha border, two-layer shadow, and both backdrop-filter declarations. Add the reduced-transparency selector pair with identical opaque-card/no-filter declarations. Add the exact `(max-width: 767px), (pointer: coarse) and (hover: none), (update: slow)` boundary that uses opaque `--glass-opaque` and disables both filters. Do not create an alternate glass utility or apply blur through Tailwind utilities.

- [ ] **Step 4: Run the focused test**

  Run: `cd frontend && node --test --test-name-pattern="tokens and transparency fallback" tests/restrained-glass-contract.test.mjs`  
  Expected: PASS for the token and fallback contract group. Other named groups remain red until their owning tasks.

- [ ] **Step 5: Commit the token system**

  ```bash
  git add frontend/app/globals.css frontend/tests/restrained-glass-contract.test.mjs
  git commit -m "feat: add restrained glass surface tokens"
  ```

## Task 3: Apply accessible shared-surface and control styling

**Files:**
- Modify: `frontend/components/ui/card.tsx:4-17`
- Modify: `frontend/components/ui/dialog.tsx:57-109`
- Modify: `frontend/components/ui/button.tsx:10-38`
- Modify: `frontend/components/ui/input.tsx:4-22`
- Modify: `frontend/components/ui/textarea.tsx:4-18`
- Modify: `frontend/components/ui/select.tsx:9-28`
- Modify: `frontend/components/ui/skeleton.tsx:14-71`
- Test: `frontend/tests/restrained-glass-contract.test.mjs`

- [ ] **Step 1: Add failing source-contract assertions**

  Assert that Card and DialogContent include `glass-surface`; outline Button uses `border-control-border`; Input/Textarea/Select use `border-input-border`; and StatsCardSkeleton/ChartSkeleton use the shared surface class while retaining `role="status"`, `aria-busy`, and screen-reader loading text.

- [ ] **Step 2: Run the focused test**

  Run: `cd frontend && npm run test:ui-contract`  
  Expected: FAIL for primitive class contracts.

- [ ] **Step 3: Implement primitive changes without changing APIs**

  Replace Card's opaque surface class with `glass-surface` while retaining `rounded-lg`, `border`, `text-card-foreground`, and its modest shadow behavior. Add `glass-surface` to DialogContent while retaining its positioning, overlay, Escape handler, close label, and focus styles. Change visible outline borders to `border-control-border`; change text-control borders to `border-input-border` and give controls an opaque semantic fill (`bg-card`) so text never depends on the backdrop. Preserve existing ring offset/focus/disabled classes. Update only statistics/chart skeleton framing to match the shared surface; leave the table skeleton opaque and its status semantics intact.

- [ ] **Step 4: Run the focused test and lint**

  Run: `cd frontend && node --test --test-name-pattern="shared primitive adoption" tests/restrained-glass-contract.test.mjs && npm run lint`  
  Expected: the shared-primitive group PASSes; ESLint completes with no errors. The full suite remains red until Task 4 establishes the opaque table boundary.

- [ ] **Step 5: Commit shared primitives**

  ```bash
  git add frontend/components/ui/{card,dialog,button,input,textarea,select,skeleton}.tsx frontend/tests/restrained-glass-contract.test.mjs
  git commit -m "feat: glassify shared surfaces and controls"
  ```

## Task 4: Lock the opaque-table boundary

**Files:**
- Create: `frontend/lib/without-table-surface-utilities.mjs`
- Create: `frontend/tests/without-table-surface-utilities.test.mjs`
- Modify: `frontend/components/ui/table.tsx:1-117`
- Test: `frontend/tests/restrained-glass-contract.test.mjs`
- Test: `frontend/tests/without-table-surface-utilities.test.mjs`

- [ ] **Step 1: Create the importable utility seam**

  Before any test imports it, create `frontend/lib/without-table-surface-utilities.mjs` with this named, deliberately incomplete implementation:

  ```js
  export function withoutTableSurfaceUtilities(className) {
    return className
  }
  ```

  This makes the module executable by the repository's Node 20 toolchain. Do not change `table.tsx` yet.

- [ ] **Step 2: Write the failing adversarial behavior test**

  Create `frontend/tests/without-table-surface-utilities.test.mjs`. It imports the module created in Step 1 and contains executable behavior tests—not source-text assertions:

  ```js
  import test from "node:test"
  import assert from "node:assert/strict"
  import { withoutTableSurfaceUtilities } from "../lib/without-table-surface-utilities.mjs"

  test("removes background-writing Tailwind utilities including variants and suffix important", () => {
    const input = [
      "p-4", "text-sm", "border", "hidden", "md:table-cell",
      "bg-red-500", "bg-red-500!", "hover:bg-red-500",
      "dark:hover:bg-red-500!", "data-[state=selected]:bg-red-500",
      "[&:nth-child(2)]:bg-red-500", "[&:nth-child(2)]:hover:bg-red-500!",
      "from-blue-500", "via-blue-500!", "to-blue-500",
      "[background:red]", "[background-color:rgb(1,2,3)]!",
      "hover:[background-image:linear-gradient(red,blue)]",
    ].join(" ")

    assert.equal(
      withoutTableSurfaceUtilities(input),
      "p-4 text-sm border hidden md:table-cell",
    )
  })

  test("preserves non-background arbitrary, layout, typography, and border utilities", () => {
    const input = [
      "md:p-4", "text-sm", "border", "border-red-500",
      "[color:canvastext]", "[mask-image:none]",
      "[&:nth-child(2)]:text-sm", "[&:nth-child(2)]:border-red-500",
      "hover:text-primary", "data-[state=selected]:text-accent-foreground",
    ].join(" ")
    assert.equal(withoutTableSurfaceUtilities(input), input)
  })

  test("accepts omitted className", () => {
    assert.equal(withoutTableSurfaceUtilities(), undefined)
  })
  ```

  Keep the static assertion that the Table wrapper remains exactly `relative w-full overflow-auto` in `restrained-glass-contract.test.mjs`; it verifies that the runtime safeguard does not change responsive overflow behavior.

- [ ] **Step 3: Run the dedicated red test**

  Run: `cd frontend && node --test tests/without-table-surface-utilities.test.mjs`  
  Expected: FAIL because the importable seam returns every conflicting background utility unchanged.

- [ ] **Step 4: Implement the shared table safeguard**

  Create `frontend/lib/without-table-surface-utilities.mjs` with a named `withoutTableSurfaceUtilities(className)` export. The `.mjs` extension is intentional: Node 20 can import and execute it through `node --test` without a TypeScript/TSX runtime, while this repository's `tsconfig.json` already has `allowJs: true` for the Next.js import. Tokenize whitespace-separated Tailwind classes, then parse each token bracket-aware: scan characters while tracking square-bracket depth and split variant prefixes only at colons encountered at depth zero. This preserves arbitrary variants with internal colons (for example, `[&:nth-child(2)]:...`) while identifying their terminal utility. Strip an optional suffix `!` from that terminal utility for classification, and remove terminal `bg-*`, `from-*`, `via-*`, `to-*`, plus arbitrary property/value forms writing `background`, `background-color`, or `background-image`. Preserve all other tokens—including arbitrary variants whose terminal utility is typography or border related—and return `undefined` when no class string is supplied.

  Import that named utility into `table.tsx` from `@/lib/without-table-surface-utilities.mjs`; do not duplicate sanitizer logic in the TSX component.

  Pass the sanitized value (never raw caller `className`) to `cn` for Table, TableHeader, TableBody, TableRow, and TableFooter. Append the locked Tailwind v4 suffix-important classes after it:

  ```text
  Table:       w-full caption-bottom bg-card! text-card-foreground text-sm
  TableHeader: bg-muted! [&_tr]:border-b
  TableBody:   bg-card! [&_tr:last-child]:border-0
  TableRow:    border-b bg-card! transition-colors hover:bg-muted! data-[state=selected]:bg-accent! data-[state=selected]:text-accent-foreground!
  TableFooter: border-t bg-muted! font-medium [&>tr]:last:border-b-0
  ```

  Do not alter TableHead, TableCell, TableCaption, the wrapper, props, semantics, or responsive caller classes.

- [ ] **Step 5: Run red-green and integration checks**

  Run: `cd frontend && node --test tests/without-table-surface-utilities.test.mjs && node --test --test-name-pattern="opaque table source contract" tests/restrained-glass-contract.test.mjs && npm run lint && npm run build`  
  Expected: the dedicated adversarial behavior test and opaque-table source-contract group PASS; lint has no errors; Next production build completes successfully. Navigation and route groups remain red until Tasks 5 and 6.

- [ ] **Step 6: Commit the opaque-table boundary**

  ```bash
  git add frontend/lib/without-table-surface-utilities.mjs frontend/components/ui/table.tsx frontend/tests/restrained-glass-contract.test.mjs frontend/tests/without-table-surface-utilities.test.mjs
  git commit -m "feat: preserve opaque data table surfaces"
  ```

## Task 5: Share chart tooltip glass and global navigation treatment

**Files:**
- Create: `frontend/components/charts/glass-tooltip.tsx`
- Modify: `frontend/components/charts/bar-chart.tsx:3-79`
- Modify: `frontend/components/charts/line-chart.tsx:3-51`
- Modify: `frontend/components/navbar.tsx:31-115`
- Modify: `frontend/app/admin/layout.tsx:23-50`
- Test: `frontend/tests/restrained-glass-contract.test.mjs`

- [ ] **Step 1: Add failing tests for shared adoption**

  Assert both chart components use one shared tooltip renderer and no longer include inline `backgroundColor`/`border` tooltip surface objects. Assert both desktop Navbar and the mobile menu surface, plus the admin navigation container, use `glass-surface` while retaining `aria-label`, `aria-current`, and mobile menu controls.

- [ ] **Step 2: Run the focused test**

  Run: `cd frontend && npm run test:ui-contract`  
  Expected: FAIL for missing shared tooltip and navigation classes.

- [ ] **Step 3: Implement shared chart and navigation surfaces**

  Add a typed Recharts tooltip renderer that returns no UI when inactive/no payload and otherwise renders the tooltip content inside `.glass-surface` with readable tokenized text. Keep chart axes, grid, series, labels, and dynamic bar colors unchanged. Replace both inline tooltip style objects with this renderer. Add `.glass-surface` only to Navbar/navigation containers—not link text—and retain active, hover, focus, and touch-target classes. Apply the same framing to the admin nav without changing link state logic.

- [ ] **Step 4: Run tests and build**

  Run: `cd frontend && node --test --test-name-pattern="shared chart and navigation" tests/restrained-glass-contract.test.mjs && npm run lint && npm run build`  
  Expected: the chart/navigation contract group PASSes; lint and build succeed. The route-adoption group remains red until Task 6.

- [ ] **Step 5: Commit chart and navigation surfaces**

  ```bash
  git add frontend/components/charts/glass-tooltip.tsx frontend/components/charts/{bar-chart,line-chart}.tsx frontend/components/navbar.tsx frontend/app/admin/layout.tsx frontend/tests/restrained-glass-contract.test.mjs
  git commit -m "feat: add glass navigation and chart tooltips"
  ```

## Task 6: Apply route-level state surfaces without touching data tables

**Files:**
- Modify: `frontend/app/page.tsx:68-152`
- Modify: `frontend/app/hosts/page.tsx:54-116`
- Modify: `frontend/app/hosts/[hostname]/page.tsx:53-157`
- Modify: `frontend/app/packages/page.tsx:37-121`
- Modify: `frontend/app/admin/api-keys/page.tsx:109-303`
- Modify: `frontend/app/admin/webhooks/page.tsx:134-213,230-280,370-700`
- Test: `frontend/tests/restrained-glass-contract.test.mjs`

- [ ] **Step 1: Add failing route-contract tests**

  Verify each listed page applies `glass-surface` to direct non-Card error, empty, search, and dialog state containers as appropriate. Verify all table instances remain `Table` components and no route passes glass/background utility overrides into Table, TableHeader, TableBody, TableRow, or TableFooter. Verify webhook's direct checkbox changes from `border-input` to `border-control-border`.

- [ ] **Step 2: Run the focused test**

  Run: `cd frontend && npm run test:ui-contract`  
  Expected: FAIL for route-level adoption assertions.

- [ ] **Step 3: Implement route-level surfaces**

  Add `.glass-surface` to direct dashboard, hosts, host-detail, packages, API-key, and webhook error/empty/search/dialog surface containers identified above. Let existing Card-based statistic, host, package-search, API-key, and webhook cards inherit the shared Card treatment; do not add nested glass surfaces. Keep `UpdatesTable`, host lists, package results, API key tables, delivery history, and their loading table skeletons opaque. Preserve every existing `ErrorBoundary`, loading skeleton, `role`, label, caption, `aria-*` attribute, refresh action, and responsive `md:` table column class.

- [ ] **Step 4: Run tests, lint, and build**

  Run: `cd frontend && npm run test:ui-contract && npm run lint && npm run build`  
  Expected: contract tests PASS; ESLint reports no errors; production build succeeds.

- [ ] **Step 5: Commit route application**

  ```bash
  git add frontend/app/page.tsx frontend/app/hosts/page.tsx 'frontend/app/hosts/[hostname]/page.tsx' frontend/app/packages/page.tsx frontend/app/admin/api-keys/page.tsx frontend/app/admin/webhooks/page.tsx frontend/tests/restrained-glass-contract.test.mjs
  git commit -m "feat: apply restrained glass across dashboard routes"
  ```

## Task 7: Perform visual, accessibility, and performance acceptance validation

**Files:**
- Modify only if an acceptance failure identifies a violation in the files above.

- [ ] **Step 1: Run the complete automated baseline**

  Run: `cd frontend && npm run test:ui-contract && npm run lint && npm run build`  
  Expected: all commands complete successfully.

- [ ] **Step 2: Verify desktop and mobile behavior manually**

  Run: `cd frontend && npm run dev`  
  Expected: Next development server reports a ready local URL. Inspect `/`, `/hosts`, a valid `/hosts/[hostname]`, `/packages`, `/admin/api-keys`, and `/admin/webhooks` in light and dark themes. Confirm current grids, breakpoints, mobile navigation, table horizontal scrolling, hidden `md:` columns, refresh controls, and theme toggle behavior have not changed.

- [ ] **Step 3: Verify accessible state behavior**

  Use keyboard-only navigation through main nav, admin nav, forms, cards, and dialogs. Confirm skip navigation, visible focus, dialog Escape/overlay/close behavior, labels, table captions, screen-reader loading text, error alerts, disabled controls, and toast readability. Confirm table header/default/hover/selected/footer fills remain opaque even if a caller attempts an important or variant-qualified background class.

- [ ] **Step 4: Verify transparency and constrained-rendering contracts**

  In browser developer tools, test both themes with:
  - emulated `prefers-reduced-transparency: reduce`;
  - `html[data-reduced-transparency="true"]`;
  - `html.reduced-transparency`;
  - each exact constrained boundary: viewport width `767px`, coarse/no-hover input emulation, and slow-update emulation where supported.

  Expected: each fallback shows opaque semantic card/`--glass-opaque` fills and computed `backdrop-filter: none` plus `-webkit-backdrop-filter: none`; removing class/attribute restores normal glass when the media feature does not match.

- [ ] **Step 5: Complete the composited contrast matrix**

  With a contrast tool that supports alpha compositing, test normal text (including muted/table/labels/status) at ≥4.5:1 and controls/chart graphics/large text at ≥3:1 for light and dark themes over `--background`, `--card`, `--popover`, `--glass-opaque`, glass over background, and glass over opaque Card/Popover. Test default, hover, selected, active, disabled, and focus-visible content states. Record remediation only if a measured result fails; do not weaken opaque table fills or focus visibility.

- [ ] **Step 6: Commit only verified fixes, if any**

  ```bash
  git add frontend/app/globals.css frontend/components frontend/app frontend/tests frontend/package.json
  git commit -m "fix: address restrained glass validation findings"
  ```

  Expected: no commit is made when validation identifies no changes.
