---
schema: pipeline.backlog-item.v1
id: pipeline.scanner-bootstrap-is-not-self-sufficient
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-29
closure_repository: self
closure_commit: 193e4dc062763832b5d0d2aad00462ddc8b5cbea
closure_evidence: plugins/pipeline-core/scripts/security-scan.test.mjs
created: 2026-08-28
sprint: nova
done_when: path-exists plugins/pipeline-core/security/semgrep/pipeline.yml
tracking: "NOW / Nova A — PO decision 2026-08-28: security is default ON and its prerequisites are made ready in init ('das ist echt basis für diese pipeline'). Pulled forward from Nova B because turning the gate on is what this item unblocks."
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

### Two of the four seeded reasons are already stale — measured 2026-08-28

The seeding comment (`lib/project-onboarding-v3.mjs`, the `gates:` line) lists
four reasons. Re-checked against what the code does today:

1. *"the evidence the push gate demands is itself what makes a fresh consumer's
   tree dirty — onboarding writes no `.gitignore`"* — **STALE.** Onboarding now
   seeds one (`PROJECT_IGNORE_SEED`, same file, covering `/scratch/`,
   `/evidence/`, `/project/pipeline-state.json`). The circle it describes is
   already broken.
2. *"needs three external scanners a consumer machine need not have"* —
   **STALE as a blocker.** Measured with no scanner reachable: `SKIPPED
   [binary_missing]` for gitleaks, osv-scanner and semgrep, `license-check: OK`,
   verdict **CLEAN, exit 0**. Missing scanners do not fail the gate; the typed
   status the item asks for in Direction (2) already exists for this case.
3. *"the measured verdict on a clean, empty consumer was WARNING -> exit 1"* —
   **needs re-measurement**, and is where the real remaining blocker sits: the v2
   path reports `BLOCKING (3 offending required capabilities)`. Required
   capabilities, not scanner absence, is what keeps the gate unsatisfiable.
4. *"`warn` would hard-block every consumer push"* — **still true**, and still
   its own separate defect. It does not block turning the gate to a real mode.

So the work this item now has to do is narrower than the comment implies: make
the required-capability set and the license allowlist resolvable from a consumer
project, and the gate becomes satisfiable. The comment itself must be corrected
in the same change — leaving two stale reasons standing is how a decision gets
re-litigated from an out-of-date premise.

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

## Closure, 2026-08-29 (dispatch NVA-R18-SCANBOOT)

Both Acceptance criteria met, verified by the dispatcher directly:
`security-scan.test.mjs` → 143/143 (including 8 new fresh-consumer/status-
distinction cases), `semgrep-default-rules.test.mjs` → 7/7 (real semgrep
binary exercised live, private-key rule fires), `project-onboarding-v3.
test.mjs` → 147/0, `check-consumer-safe-paths.test.mjs` → 9/9.

`plugins/pipeline-core/security/semgrep/pipeline.yml` exists — a real,
tested ruleset, relocated (git-detected 93% rename) from an already-shipped-
but-differently-named file (`config/security/semgrep-default-rules.yml`,
landed by an earlier, unrelated dispatch `92d1b711`) rather than duplicated;
all production/test references repointed.

The two stale seeding-comment reasons this item's own analysis identified
are corrected in `project-onboarding-v3.mjs` (`19233eab`); the gate's
default seeded value stays `off`, unchanged, per this item's own
acknowledgment that the reasoning for defaulting off is sound.

**The "required capabilities" blocker turned out not to be a real
fresh-consumer problem at all** — disproving this item's own remaining-
blocker hypothesis, confirmed empirically rather than assumed: an absent
`governance/security-controls/catalog.json` (the normal fresh-consumer
shape) already degrades the required-capability set to empty, so
`checkSecurityCompleteness` (the actual guard-push v2 gate) already passes
today. No capability-resolution code needed to change; a new regression
test (`security-scan.test.mjs`'s "fresh consumer (no catalog)" block) pins
this directly. `sourceCapabilityPlan()`'s `mod.cli-lib` activation heuristic
— the thing that actually produced the "3 offending required capabilities"
verdict this item measured — is self-application-only (it fires against
this repository's own catalog, not a fresh consumer's absent one); noted for
awareness, not filed as a new item.
