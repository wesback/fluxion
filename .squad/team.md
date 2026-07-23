# Squad Team

> fluxion

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Neo | Lead / Architect | [charter](agents/neo/charter.md) | 🟢 Active |
| Trinity | Backend & Data Engineer | [charter](agents/trinity/charter.md) | 🟢 Active |
| Morpheus | Frontend Engineer | [charter](agents/morpheus/charter.md) | 🟢 Active |
| Tank | Platform / DevOps Engineer | [charter](agents/tank/charter.md) | 🟢 Active |
| Dozer | Security & Observability Engineer | [charter](agents/dozer/charter.md) | 🟢 Active |
| Scribe | Scribe | [charter](agents/scribe/charter.md) | 📋 Always on |
| Ralph | Work Monitor | [charter](agents/ralph/charter.md) | 🔄 Monitor |
| Rai | RAI Reviewer | [charter](agents/Rai/charter.md) | 🛡️ Always on |
| Fact Checker | Fact Checker | [charter](agents/fact-checker/charter.md) | 🔍 Always on |


## Coding Agent

<!-- copilot-auto-assign: false -->

| Name | Role | Charter | Status |
|------|------|---------|--------|
| @copilot | Coding Agent | — | 🤖 Coding Agent |

### Capabilities

**🟢 Good fit — auto-route when enabled:**
- Bug fixes with clear reproduction steps
- Test coverage (adding missing tests, fixing flaky tests)
- Lint/format fixes and code style cleanup
- Dependency updates and version bumps
- Small isolated features with clear specs
- Boilerplate/scaffolding generation
- Documentation fixes and README updates

**🟡 Needs review — route to @copilot but flag for squad member PR review:**
- Medium features with clear specs and acceptance criteria
- Refactoring with existing test coverage
- API endpoint additions following established patterns
- Migration scripts with well-defined schemas

**🔴 Not suitable — route to squad member instead:**
- Architecture decisions and system design
- Multi-system integration requiring coordination
- Ambiguous requirements needing clarification
- Security-critical changes (auth, encryption, access control)
- Performance-critical paths requiring benchmarking
- Changes requiring cross-team discussion

## Project Context

- **Project:** fluxion
- **Owner:** Wesley Backelant
- **Created:** 2026-07-11T00:05:53.066+02:00
- **Focus:** Linux package-update tracking with APT hooks, a FastAPI/Python/PostgreSQL backend, and a Next.js/React dashboard.
- **Platform:** Azure AKS with Terraform, Helm, and ArgoCD.
