<!-- ai-sdlc-pipeline:start (managed by wesback/engineeringpipelinev3 scripts/onboard-repo.sh) -->
## Issues for the AI-SDLC pipeline

This repository is worked by an autonomous pipeline: Copilot implements an issue,
three Codex reviewers check it, and AI-SDLC merges it when every gate passes. An issue is picked up when it has the
label `ai-eligible`, passes AI-SDLC's Definition-of-Ready gate, and every issue it depends on is closed. When you
(a person or an assistant) write an issue for it, follow these rules.

### What a story must contain

- **One change**, with a clear title and a one-paragraph goal.
- **The files it touches**, by path, inside the implementer's write scope (source and test folders).
- **`## Acceptance criteria`**: checkboxes, each using `Test: \`<test path>\` / \`<exact test case>\`.` (or
  `Verified by CI: <existing job>` / `Verified by review.`) and
  `Negative case: <input or state> -> <exact expected rejection or no-op>.` These exact markers are required by preflight.
- **Size**: the pipeline refuses a change over 300 changed lines. Estimate changed lines, including tests, in
  `Expected size: about N changed lines, including tests.` Split stories likely to exceed 300 lines before
  implementation; every part stays at or under the limit.
- **One named test per criterion**: each unit-testable criterion names its exact test file and case. Contract tests include concrete
  input and expected-result rows; criteria verified outside unit tests name the specific CI job or review.
- **A behaviour test**: name the test file. The test must fail on a broken version; the pipeline requires the new tests
  to fail on `main` and pass on the branch, and the whole test suite to pass. One exception: a story that changes
  **only test files** (tests, specs, e2e, fixtures; no production file) cannot fail on `main`, so the pipeline waives
  that check for it. Say "tests only" in the goal. A new test that pins behaviour `main` already has belongs in such a
  story, never in one that also changes production code.
- **`Depends on #N`**, one line per prerequisite issue. The story waits until those are closed.
- **`PRD: docs/prd/<file>.md`** when the story comes from a PRD; cite the PRD's requirement IDs (FR-, NFR-, AC-).
- **No wishlist words**: "nice to have", "maybe", "TBD", "etc.".
- **Never** ask for changes to `.github/`, `.ai-sdlc/`, `AGENTS.md` or other CI files: the implementer cannot
  write them and the pipeline never merges them. A story may add a package to a backend `.csproj` or to
  `frontend/package.json` (with its lockfile) when it needs one; name the package and why.

### Rules that keep a story from getting stuck

Each rule comes from a story that stopped for a person because it was missing (D109).

- **Every criterion uses the preflight's exact verifier and negative-case syntax.** For unit-testable behavior, write
  `Test: \`<test path>\` / \`<exact test case>\`.` and
  `Negative case: <input or state> -> <exact expected rejection or no-op>.` A criterion that no unit test can prove
  (a build or publish succeeds, how a page looks in a browser, what an external tool, cloud service or the platform
  does, a deployment) uses `Verified by CI: <existing workflow job>` or `Verified by review.` and still includes the
  negative-case line. Equivalent prose without these markers does not pass the deterministic preflight.
- **Lists are written out in full.** Never "the other headers", "and so on", "all required fields": name every item and,
  where it matters, the exact value (a header and its value, a field and its type).
- **What the story relies on exists.** Every endpoint, class, method, setting or file the story calls or extends is on the
  default branch, or is created by this story or by one it depends on (`Depends on #N`). A page that must not show data
  before a check needs a server endpoint that enforces the check.
- **Platform controls go in infrastructure stories.** A grant, a network rule, a read-only mount, an identity's write
  access or a role assignment is enforced and tested by the infrastructure (Terraform) story, not by application code.
- **Code outside the test process gets a testable seam.** Logic that runs in a child process, a worker or a script is put in
  a plain method the unit tests call directly (`Main` stays a one-line call), because coverage only sees the test
  process. One test may still start the real process to prove the wiring.
- **Unit tests use only what CI installs.** No unit test runs `npm`, `dotnet publish`, a browser, Docker or a cloud
  service; such a check is `Verified by CI` or `Verified by review`.
- **A criterion that something does not happen is checked at runtime.** "Resolving the client creates no credential", "no
  network request is made" is proved by a counting fake, a spy or a fake HTTP handler that the test asserts on (0 calls
  before the action, the expected count after). A scan of source files for constructors or patterns cannot prove it
  (any scan has a gap, and reviewers keep finding the next one); the story does not ask for one. What no fake can observe
  is `Verified by review`.
- **A property that must hold under concurrent or repeated use states its invariants and the operation that gives them.**
  Where a criterion says a value stays current, a submission is atomic, a stored object cannot change, or a request is
  accepted once, the story names each invariant (atomic with the check, immutable after storing, exact identity: ID,
  version and content) and the existing operation that provides it (a store's expected-revision commit, a lock, a
  read-only copy). Without that, reviewers raise one weaker layer per round: a recheck, then identity, then mutation.
  Each invariant gets its own test, and a test for a race uses a fake that changes the state between the read and the write.
- **A test of a contract lists concrete cases.** A criterion that a guard, parser, filter, schema or API test covers
  "the contract" has a table with concrete `Input` and exact `Expected result` columns, including positive and negative
  cases. It names the test that exercises the table and says that other inputs are out of scope. A reviewer's next
  input variant is then a new story, not a failing round.
- **Security filters work on names and exact shapes.** A redaction or validation rule lists the property names and the
  exact patterns it acts on (for example `Bearer <token>`, three base64url segments of 8+ characters separated by dots).
  It never judges free text by keywords or wording; what a filter cannot decide structurally goes to a person (an
  internal review task), and the story says so.
- **Tests are designed, not hoped for.** Where a test needs a particular setup (a temporary `wwwroot`, a fake clock, a
  mock provider, a fixture), the story says which.
- **A test exercises the production path the criterion names.** It calls the real endpoint through the application's
  test host, the real command or the real store (an in-memory database or a temporary directory where the repository's
  tests use one), and says which. A test that drives a fake session, a copy of a helper or a test-local re-implementation
  proves nothing about production, and reviewers fail it round after round. A fake stands in only at the edge the
  criterion does not cover (a clock, a network call, a model).
- **Wiring is covered through the host.** A story that registers an endpoint, a service or middleware tests it through the
  same startup code production uses, so the registration lines count for diff coverage; a test that builds its own
  host leaves them uncovered and the story stops on coverage.
- **A negative case fails for the reason it names.** The test changes one thing in a valid input and asserts the exact
  reason or error code; a second invalid field (a mismatched setting, a wrong role) makes it pass for the wrong reason.
- **Adding to a set that a test enumerates names that test.** A new migration (the chain's head), a seeded user, a route, a
  dependency or a fixture item changes a test that lists the old set; the story names it "updated in this story" with the
  new expectation, and does not also call it unedited.
- **A new limit names the tests it affects.** A story that adds a rate limit, a quota or a size cap lists the existing tests
  that would cross it and how they stay under it (an injected clock, a fresh session, a reset); a test that sends many
  requests says how it avoids the endpoint's limit.
- **Only writable files on the Files line.** The implementer writes source and test folders and whatever the repository's
  write policy adds; build and compiler configuration, workflows under `.github/`, `.ai-sdlc/` and other root files are
  outside it unless that policy lists them. A change there is its own story that a person merges, or a person makes it.
- **Count test lines honestly.** Tests are usually as large as the code or larger: a contract table, a race test and an
  endpoint test add 60 to 150 lines each. An endpoint with its contract table and its performance or limit tests is two
  stories: the behaviour first, then a "tests only" story.
- **Small enough.** Before implementation, estimate the changed lines including tests and record
  `Expected size: about N changed lines, including tests.` A story likely to exceed 300 changed lines is split into
  independent stories before implementation; every part is estimated at 300 lines or fewer.
- **No wishlist or hedge words, even as ordinary words.** The Definition-of-Ready gate rejects `TBD`, `TODO`, `XXX`, `FIXME`,
  `???`, "not sure", "decide later", "to be determined", "to be decided", "up to the dev" and the word "placeholder"
  anywhere outside a fenced code block. Write "template field", "token" or "parameter" instead.
- **A merge that is itself a decision says so.** When the merge of the pull request is a person's approval or freeze (a frozen
  fixture, a sign-off, a real-world run), put the line `Merge: person (<why a person decides>)` in the story, with the reason in the brackets: the reason is shown to the person on the pull request and the dashboard. The pipeline then stops the finished pull
  request for that person and never merges it.
- **No automated pixel or contrast measurement in a browser.** A criterion never asks for a Chromium test that samples rendered
  pixels or measures contrast ratios (such suites are slow and fragile).
  State the requirement as a CSS or markup contract a unit test can read (a token, a rule, an attribute), or as `Verified by review`.
- **A test input that looks like a link is not written as a link.** The Definition-of-Ready gate fetches every `http://` or
  `https://` address in the story and refuses it when one does not resolve (for example `https://evil.example` in an
  injection test). Write the address as parts (the URL formed by `https:` followed by `//evil.example`) or without the scheme,
  and let the test build the string.
- **A fact outside the repository is verified by CI or by evidence recorded in the repository, never "by review".** Reviewers read the
  diff; they cannot query a package registry, a deployed service or another repository (a story stopped three times
  on "the pinned release is not published"). A criterion that depends on such a fact names the CI job that fails when it is wrong
  (`npm ci` for a pinned version), or the table the change records it in, and says reviewers check the table for completeness.
- **A change to a token, selector, style or behaviour lists the existing tests that assert the old one.** Search the repository's
  tests for the old value and name them in the story with "updated in this story" (a story stopped because five existing
  tests asserted the look it removed, and a fix round may not edit tests). A criterion that contradicts an
  existing test says which of the two wins.
- **Few checks, and each one matters.** A criterion that audits a long list (more than about 15 selectors, properties, files or regular
  expressions) invites one new finding per review round, and a fixer that cannot satisfy it without breaking an older test
  (one story audited about 60 properties and took four hours). State the rule once ("no rule uses a colour literal") and let the test
  enumerate the cases from the code or a fixture; the criterion names that test and the cases that must be rejected, not every selector.

### Before you finish (the implementing and fixing agent)

The reviewers fail a pull request on the same few things, so check them before you stop (D142):

1. **Every acceptance criterion has a test that proves it.** Name the test for each criterion. A test that would still pass if the behaviour were removed proves nothing: check that it fails without the change.
2. **Assert exact values.** Headers, identifiers, counts, states and error text are compared whole, not with "contains" or "any".
3. **One negative case per criterion** unless it is purely presentational: invalid input, a denied role, missing data, an out-of-scope id.
4. **Security criteria: try to get around them.** Ask what a caller can do without the check (another role, an indirect reference, an unlisted path) and test that it fails.
5. **Stay on the Files line.** If the change needs another file, say so in your final message instead of editing it.
6. **No wishlist words** (TBD, TODO, "placeholder") in anything you write.
7. **Run the full test command** and make it pass before you finish.

### Rules by language (D203)

Apply the ones for the files you touch. They come from the stops this pipeline has had; each is a way a pull request failed review or CI.

**C# / .NET**
- Run the whole test project (`dotnet test`), not only the new tests: a change to a shared service, endpoint or fixture breaks tests elsewhere.
- A test host that maps an endpoint must register every service the handler takes (an unregistered one is inferred as a request body and the host throws).
- Signed or checksummed fixtures (a data file with a manifest and a detached signature): update the fixture and the manifest's hash and counts; never write or edit the signature. Say in your final message that the key holder must re-sign.
- Parsers and validators: list the accepted and rejected inputs in a `[Theory]` table, and include the encoded forms (escapes, comments, mixed case, empty and oversized values). A case that is not in the table will come back as a new review finding.
- Keep loops linear: no rescan of the whole input per item.

**JavaScript / CSS / HTML**
- Run the full `npm test`: browser tests measure computed styles and fail on a flat colour where a gradient was.
- When you replace a legacy design token, search `tests/` for the old token name and update only assertions about the code you changed; say which ones you updated.
- A source-level guard (a test that scans CSS or JS) needs negative fixtures for each bypass: a selector inside `:not()`/`:is()`, a comment, an alternate spelling.
- Keep contrast at 4.5:1 for text on the colour it sits on, in both themes.

**Terraform**
- Update the matching `.tftest.hcl` when you add a resource, grant or output.
- Never `git add` provider directories (`.terraform/`) or state; stage the files you edited by path.

**Shell and workflows**
- Quote variables, use `set -euo pipefail`, and do not edit a script another process is running in place.

### Story template

```markdown
<Goal: what changes and why, in one paragraph.> Files: `<path>`, `<test path>`.

Expected size: about <N> changed lines, including tests.

## Acceptance criteria

- [ ] <observable behaviour>. Test: `<test file>` / `<exact test case>`. Negative case: <input or state> -> <exact expected rejection or no-op>.
- [ ] Existing tests pass. A test that asserts the old behaviour this story removes is updated to the new behaviour, never deleted. No other files are changed.

For a contract-test criterion, include concrete cases:

| Input | Expected result |
| --- | --- |
| <valid or boundary input> | <exact result> |
| <invalid or forbidden input> | <exact rejection or no-op> |

Depends on #<n>
PRD: docs/prd/<file>.md
```

### Creating it

```sh
gh issue create -R <owner>/<repo> --title "<title>" --body-file story.md            # a draft: not picked up yet
gh issue edit <n> -R <owner>/<repo> --add-label ai-eligible                         # ready: the pipeline takes it
```

Set each planned story's `areas` to the code layers it changes (`frontend`, `backend`, `infra`); the issue gets matching `area:*` labels. The implementer and fixer load only the skills configured for those labels in `config/repos.json`. Frontend stories keep the shared UI and accessibility skills; stack-specific skills are repo-configured. Terraform tests must be plan-only with mocked providers where practical; do not add `command = apply`, because the pipeline's `terraform test` step runs repository tests and apply-mode tests can create real resources.

### Big features: PRD first

A feature too large for one story starts as a PRD. The merge of the PRD is the human gate; nothing is built before it.

1. **Assess research before drafting.** Set Research status in the PRD template to `Required` when material requirements
   depend on external facts, unfamiliar APIs or platform behavior, consequential assumptions, or competing product or
   architecture choices. Otherwise set it to `Not required` and explain why.
2. **Research when required.** Before PRD approval, run bounded HVE Core `/rpi-research` on questions that could change
   requirements. Run the Research phase only; the post-merge Functional Planner and AI-SDLC steps own story planning
   and implementation. Set `docs` as the trusted evidence root so the dated artifact is committed at
   `docs/research/YYYY-MM-DD/<task-slug>-research.md` with the PRD. Record every material finding in the Research
   Finding Dispositions table and resolve questions that could change scope, behavior, security, or story order.
   A PRD merged for automatic planning must have Planning blockers set to `None`.
3. **Write the PRD** in `docs/prd/<name>.md` on the template `docs/templates/prd-template.md` (HVE Core's
   requirements-author template). In an assistant session, HVE's `prd-builder` agent fills it in. Give every
   requirement and acceptance criterion a stable ID: `FR-1`, `NFR-1`, `AC-1`. Say what is out of scope and what the
   security notes are (data handled, trust boundaries). The planner's PRD review stops on the same gaps every time;
   close them in the PRD, because each one becomes a decision a person is asked later:
   - **Who may do what:** a table of roles by resource or action (allowed or denied), including unknown roles, what a
     denial returns, and that a denied request reaches no data source. Each criterion that says "an in-scope user" names
     the fields each role sees.
   - **Every limit is exact and tested:** a rate limit, quota, size, depth or count states its window (rolling or fixed),
     what it counts (per user, per endpoint, denied attempts too or not), the status and error code over the limit, and
     has an acceptance criterion with the boundary values.
   - **Every error is named:** status and error code for each rejection (invalid input, unsupported version, missing
     anti-forgery token, conflict), and what the response does not contain.
   - **"Unchanged", "atomic", "idempotent" name their invariants:** which stored data, pins and audit records stay exactly
     as they were after an injected failure, and an acceptance criterion that asserts each one.
   - **Counts agree:** a goal or metric that counts criteria matches the list it names.
   - **Shared identifiers:** identifiers reused from another PRD are named as canonical and one criterion compares them.
   - **A person's approval is a recorded merge:** an approval, freeze or sign-off says what a person merges (a file, a
     fixture pull request) and which stories wait for it.
   - **Constraints name their source** (a policy file, a decision) and say whether something is forbidden or only not
     needed; companion PRD versions are current.
4. **Merge it through a PR.** A named person approves it after checking Research status, rationale, any required artifact
   and finding dispositions, and that Planning blockers are `None`.
5. **Planning** (on for this repository: the pipeline runs it by itself after the merge): HVE's PRD quality review, the Security Planner (a threat model in
   `docs/security/`), and the Functional Planner (the stories). The stories become issues with `ai-eligible`, a
   `PRD:` line, `Depends on #N` lines, and the threat model's mitigations as acceptance criteria. Review the created
   issues; each still has to pass the readiness gate before it is built.
6. **Stories are built one at a time** in dependency order and merged by the pipeline.

Changing an approved PRD later: edit it in a PR (an addendum is fine). A changed PRD file is planned again when
planning is on, so say in the PR whether the change needs new stories.
The post-merge PRD quality review is a backstop, not a substitute for completing required research before approval.

### A change that must be large

The pipeline keeps a story under 300 lines (500 once the repository has earned it): reviewers read the whole diff, and the pipeline merges small changes on its own. When a change cannot be split (a rename across the codebase, a framework upgrade, a codemod), a person may add the label `ai-sdlc:large-change` to the issue. The implementer and the fixer may then change up to 1500 lines, the reviewers are told to read it file by file, and the pull request always waits for a person to merge it. Only a person sets the label; do not add it yourself and do not copy it to a story you split.

### Working on a story yourself

Add `ai-sdlc:manual` to the issue before you touch its branch: the dispatcher, the doctor and a running cycle then leave the story alone (a
running cycle stops at its next step). Remove the label when you hand it back. A story that stops again and again (three stops in a day, or
two more than two hours apart) is labelled `ai-sdlc:parked` with a comment that lists the options: simplify the story, split it, do it by
hand (add `ai-sdlc:manual`), or drop it. Nothing retries a parked story; remove `ai-sdlc:parked` and `ai-sdlc:needs-human` to hand it back.

### After you label it

The pipeline opens a PR from `ai-sdlc/issue-<n>`. Do not push to that branch. If the pipeline needs a person it labels
the PR or issue `ai-sdlc:needs-human` and comments why; fix the issue text and remove the label to let it retry.
<!-- ai-sdlc-pipeline:end -->
