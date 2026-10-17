<!-- ai-sdlc-pipeline:start (managed by wesback/engineeringpipelinev3 scripts/onboard-repo.sh) -->
## Issues for the AI-SDLC pipeline

This repository is worked by an autonomous pipeline (wesback/engineeringpipelinev3): Copilot implements an issue,
three Codex reviewers check it, and AI-SDLC merges it when every gate passes. An issue is picked up when it has the
label `ai-eligible`, passes AI-SDLC's Definition-of-Ready gate, and every issue it depends on is closed. When you
(a person or an assistant) write an issue for it, follow these rules.

### What a story must contain

- **One change**, with a clear title and a one-paragraph goal.
- **The files it touches**, by path, inside the implementer's write scope (source and test folders).
- **`## Acceptance criteria`**: checkboxes, each one testable, each naming the behaviour and at least one negative case.
- **Size**: the pipeline refuses a change over 300 changed lines (added plus removed) or one with no test file. Aim for a story that changes
  well under 300 lines; split anything bigger, and give a deletion-only cleanup its own test.
- **One test per criterion, named by it**: each acceptance criterion gets at least one test, and the test says which
  criterion it covers (in its name or a comment such as `AC: M-01`). Reviewers check this criterion by criterion.
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

- **Every criterion names how it is verified.** By default it is a unit test in the story's test file. A criterion that no
  unit test can prove (a build or publish succeeds, how a page looks in a browser, what an external tool, cloud service or
  the platform does, a deployment) ends with `Verified by CI: <job>` (an existing job in `.github/workflows/`) or with
  `Verified by review.`, and no test is asked for it.
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
- **A test of a contract lists its cases.** A criterion that a guard, parser, filter or schema test covers "the contract"
  has a table of the inputs and the expected result of each (every property name, selector form, token set or value
  the test must accept or reject), and says that other inputs are out of scope. A reviewer's next input variant is then a
  new story, not a failing round.
- **Security filters work on names and exact shapes.** A redaction or validation rule lists the property names and the
  exact patterns it acts on (for example `Bearer <token>`, three base64url segments of 8+ characters separated by dots).
  It never judges free text by keywords or wording; what a filter cannot decide structurally goes to a person (an
  internal review task), and the story says so.
- **Tests are designed, not hoped for.** Where a test needs a particular setup (a temporary `wwwroot`, a fake clock, a
  mock provider, a fixture), the story says which.
- **Small enough.** Well under 500 changed lines including tests; a story that needs more is two stories, the second
  depending on the first.
- **No wishlist or hedge words, even as ordinary words.** The Definition-of-Ready gate rejects `TBD`, `TODO`, `XXX`, `FIXME`,
  `???`, "not sure", "decide later", "to be determined", "to be decided", "up to the dev" and the word "placeholder"
  anywhere outside a fenced code block. Write "template field", "token" or "parameter" instead.
- **A merge that is itself a decision says so.** When the merge of the pull request is a person's approval or freeze (a frozen
  fixture, a sign-off, a real-world run), put the line `Merge: person (<why a person decides>)` in the story, with the reason in the brackets: the reason is shown to the person on the pull request and the dashboard. The pipeline then stops the finished pull
  request for that person and never merges it.
- **No automated pixel or contrast measurement in a browser.** A criterion never asks for a Chromium test that samples rendered
  pixels or measures contrast ratios (butlercompass removed that suite on 2026-10-16: slow, fragile, a personal application).
  State the requirement as a CSS or markup contract a unit test can read (a token, a rule, an attribute), or as `Verified by review`.
- **A test input that looks like a link is not written as a link.** The Definition-of-Ready gate fetches every `http://` or
  `https://` address in the story and refuses it when one does not resolve (fluxion #84: `https://evil.example` in an
  injection test). Write the address as parts (the URL formed by `https:` followed by `//evil.example`) or without the scheme,
  and let the test build the string.
- **A fact outside the repository is verified by CI or by evidence recorded in the repository, never "by review".** Reviewers read the
  diff; they cannot query a package registry, a deployed service or another repository (fluxion #104 and #105 stopped three times
  on "the pinned release is not published"). A criterion that depends on such a fact names the CI job that fails when it is wrong
  (`npm ci` for a pinned version), or the table the change records it in, and says reviewers check the table for completeness.
- **A change to a token, selector, style or behaviour lists the existing tests that assert the old one.** Search the repository's
  tests for the old value and name them in the story with "updated in this story" (butlercompass #931 stopped because five existing
  tests asserted the glass and gold look the story removed, and a fix round may not edit tests). A criterion that contradicts an
  existing test says which of the two wins.

### Before you finish (the implementing and fixing agent)

The reviewers fail a pull request on the same few things, so check them before you stop (D142):

1. **Every acceptance criterion has a test that proves it.** Name the test for each criterion. A test that would still pass if the behaviour were removed proves nothing: check that it fails without the change.
2. **Assert exact values.** Headers, identifiers, counts, states and error text are compared whole, not with "contains" or "any".
3. **One negative case per criterion** unless it is purely presentational: invalid input, a denied role, missing data, an out-of-scope id.
4. **Security criteria: try to get around them.** Ask what a caller can do without the check (another role, an indirect reference, an unlisted path) and test that it fails.
5. **Stay on the Files line.** If the change needs another file, say so in your final message instead of editing it.
6. **No wishlist words** (TBD, TODO, "placeholder") in anything you write.
7. **Run the full test command** and make it pass before you finish.

### Story template

```markdown
<Goal: what changes and why, in one paragraph.> Files: `<path>`, `<test path>`.

## Acceptance criteria

- [ ] <behaviour>, and <the negative case that must fail>.
- [ ] `<test file>` passes, and fails when <the change> is missing.
- [ ] Existing tests pass. A test that asserts the old behaviour this story removes is updated to the new behaviour, never deleted. No other files are changed.

Depends on #<n>
PRD: docs/prd/<file>.md
```

### Creating it

```sh
gh issue create -R <owner>/<repo> --title "<title>" --body-file story.md            # a draft: not picked up yet
gh issue edit <n> -R <owner>/<repo> --add-label ai-eligible                         # ready: the pipeline takes it
```

Add `area:frontend` for UI stories (the implementer then loads the UI and accessibility skills).

### Big features: PRD first

A feature too large for one story starts as a PRD. The merge of the PRD is the human gate; nothing is built before it.

1. **Write the PRD** in `docs/prd/<name>.md` on the template `docs/templates/prd-template.md` (HVE Core's
   requirements-author template). In an assistant session, HVE's `prd-builder` agent fills it in. Give every
   requirement and acceptance criterion a stable ID: `FR-1`, `NFR-1`, `AC-1`. Say what is out of scope and what the
   security notes are (data handled, trust boundaries).
2. **Merge it through a PR.** A named person approves it in the PR.
3. **Planning** (on for this repository: the pipeline runs it by itself after the merge): HVE's PRD quality review, the Security Planner (a threat model in
   `docs/security/`), and the Functional Planner (the stories). The stories become issues with `ai-eligible`, a
   `PRD:` line, `Depends on #N` lines, and the threat model's mitigations as acceptance criteria. Review the created
   issues; each still has to pass the readiness gate before it is built.
4. **Stories are built one at a time** in dependency order and merged by the pipeline.

Changing an approved PRD later: edit it in a PR (an addendum is fine). A changed PRD file is planned again when
planning is on, so say in the PR whether the change needs new stories.

### A change that must be large

The pipeline keeps a story under 300 lines (500 once the repository has earned it): reviewers read the whole diff, and the pipeline merges small changes on its own. When a change cannot be split (a rename across the codebase, a framework upgrade, a codemod), a person may add the label `ai-sdlc:large-change` to the issue. The implementer and the fixer may then change up to 1500 lines, the reviewers are told to read it file by file, and the pull request always waits for a person to merge it. Only a person sets the label; do not add it yourself and do not copy it to a story you split.

### After you label it

The pipeline opens a PR from `ai-sdlc/issue-<n>`. Do not push to that branch. If the pipeline needs a person it labels
the PR or issue `ai-sdlc:needs-human` and comments why; fix the issue text and remove the label to let it retry.
<!-- ai-sdlc-pipeline:end -->
