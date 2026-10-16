---
name: AI-SDLC story
about: A story for the AI-SDLC pipeline. Add the ai-eligible label when it is ready to be picked up.
title: ''
labels: ''
---

<Goal: what changes and why, in one paragraph. Write "tests only" if no production file changes.> Files: `<path>`, `<test path>`.

## Acceptance criteria

- [ ] <behaviour>, and <the negative case that must fail>.
- [ ] `<test file>` passes, and fails when <the change> is missing.
- [ ] <a criterion no unit test can prove: a build, how a page looks, a platform or tool behaviour>. Verified by CI: <workflow job>. (or: Verified by review.)
- [ ] Existing tests pass. A test that asserts the old behaviour this story removes is updated to the new behaviour, never deleted. No other files are changed.

Depends on #<n>
PRD: docs/prd/<file>.md

<!-- Rules: see "Issues for the AI-SDLC pipeline" and "Rules that keep a story from getting stuck" in AGENTS.md:
     name how each criterion is verified, write lists out in full, rely only on code that exists or a story you depend on. One change per issue; name the files and the test;
     no "nice to have", "maybe", "TBD", "etc."; never .github/, .ai-sdlc/, AGENTS.md, CI or dependency files.
     Delete the Depends on / PRD lines when they do not apply. -->
