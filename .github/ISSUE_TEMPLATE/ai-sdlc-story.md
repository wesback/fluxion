---
name: AI-SDLC story
about: A story for the AI-SDLC pipeline. Add the ai-eligible label when it is ready to be picked up.
title: ''
labels: ''
---

<Goal: what changes and why, in one paragraph. Write "tests only" if no production file changes.> Files: `<path>`, `<test path>`.

Expected size: about <N> changed lines, including tests.

## Acceptance criteria

- [ ] <observable behaviour>. Test: `<test file>` / `<exact test case>`. Negative case: <input or state> -> <exact expected rejection or no-op>.
- [ ] <a criterion no unit test can prove: a build, how a page looks, a platform or tool behaviour>. Verified by CI: <existing workflow job>. Negative case: <state> -> <expected failure>. (or: Verified by review.)
- [ ] Existing tests pass. A test that asserts the old behaviour this story removes is updated to the new behaviour, never deleted. No other files are changed.

For a contract-test criterion, include concrete cases:

| Input | Expected result |
| --- | --- |
| <valid or boundary input> | <exact result> |
| <invalid or forbidden input> | <exact rejection or no-op> |

Depends on #<n>
PRD: docs/prd/<file>.md

<!-- Rules: see "Issues for the AI-SDLC pipeline" and "Rules that keep a story from getting stuck" in AGENTS.md:
     name the exact verifier and a negative case in every criterion, write contract inputs and exact expected results, write lists out in full,
     estimate changed lines including tests and split above 500. Rely only on code that exists or a story you depend on. One change per issue; name the files and tests;
     no "nice to have", "maybe", "TBD", "etc."; never .github/, .ai-sdlc/, AGENTS.md, CI or dependency files.
     Delete the Depends on / PRD lines when they do not apply. -->
