---
schema: pipeline.backlog-item.v1
id: pipeline.scanner-bootstrap-is-not-self-sufficient
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "Nova B — part of the rebuilt guided init"
source: "Codex/WSL greenfield run, 2026-08-28 (docs/pipeline-session-analysis-2026-08-28.md), plus the PO's own observation that this runner needed three sessions and the most detours."
---

# A fresh project has to repair the Pipeline's own scanner packaging before its security gate means anything

## What happened

The Codex run had to build the scanner configuration itself: gitleaks looked for
its configuration in the installed plugin cache; semgrep failed without a local
rule directory. Making the gate real required `.gitleaks.toml`, a local
`security/semgrep/pipeline.yml`, a `project/pipeline.yaml` reference — and a
human override to change a gate-strength file.

Its verdict is the one to keep: a pipeline that must first repair its own
packaging "erzeugt falsche Negativsignale ('Security ist kaputt')".

## Corroboration from this repository

The security gate is seeded `off` for a fresh consumer, and the seeding comment
explains why at length: the scanners may be absent, the license allowlist path
exists only in the Pipeline's own repository, and a `warn` value would hard-block
every consumer push. That reasoning is sound. But it means a consumer's honest
path to *turning the gate on* runs straight through the packaging gap above.

## Direction

1. Package the scanner configurations with the plugin, or create them
   project-locally in one atomic bootstrap step. Never mix plugin-cache and
   project paths.
2. Report per scanner, distinctly: `passed`, `findings`, `not-configured`,
   `tool-unavailable`, `not-applicable`. An empty rule set must never read like a
   successful deep scan.
3. Ship a minimal, tested default semgrep configuration.

This repository's own measurement supports (2) directly: with no scanner
reachable, `security-scan.mjs` reports `SKIPPED [binary_missing]` per tool and a
CLEAN verdict — the distinction already exists and works; what is missing is the
configuration path that lets a consumer move from `not-configured` to a real
scan without hand-building it.

## Acceptance criteria

- Turning the security gate on in a fresh consumer project requires no
  hand-authored scanner configuration and no gate-strength override.
- The five statuses are distinguishable in the evidence.
