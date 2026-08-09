---
schema: pipeline.backlog-item.v1
id: pipeline.guard-denial-escalates-benign-commands-to-human-in-terminal
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Live observation of the PO's private Codex+Pipeline 0.5.4 happy-path test run (fifth local candidate), 2026-08-09 (sanitized, no PO-identifying data)."
due: 2026-08-16
---

# Every `guard-lifecycle-ready.mjs` denial escalates to a full human-in-terminal ceremony on this host, even for read-only or explicitly mandated commands

## What happened

In the observed run, `guard-lifecycle-ready.mjs` twice denied a command with
`GUARD-LIFECYCLE-NOT-READY` (once for a plain `--help` invocation, once for
`observation-governance-bootstrap.mjs` — a step `SKILL.md` itself names as a
mandatory, ordinary bootstrap action) while readiness had drifted
(`kickoff-required`, then `projection-drift`). Both denials carried the
guard's own sensible, agent-executable recovery text ("re-run the typed
inspection with intent session"), but each was ALSO escalated by
`codex-pretool-guard.mjs`'s fallback (lines ~500-560) to
`HGO-EXTERNAL-REPOSITORY-OBSERVATION`: `status: "external-operator-required"`,
requiring the human to manually copy-paste the exact denied command in an
attended host terminal. That fallback fires whenever
`guard-human-override.mjs`'s override-planning throws `HGO-GIT`/`HGO-ROOT`/
`HGO-COMMON-DIR` (`lib/human-guard-override.mjs` ~lines 135-154) — which it
did for every denial observed in this run, on this WSL host, for this
repository.

The practical effect: on this host, ANY `guard-lifecycle-ready.mjs` denial —
including for a harmless `--help` call or a script the skill explicitly
tells the agent to run itself — turns into a full manual-intervention
ceremony, defeating the guard's own, already-correct "just re-run inspect"
recovery advice. This is also what the sibling item's resume-hint write
denial escalated into.

## Direction

Not yet root-caused why `guard-human-override.mjs`'s `physicalRoot()`/
`topology()` throws `HGO-GIT`/`HGO-ROOT`/`HGO-COMMON-DIR` for this
host/repository combination — needs investigation (WSL-specific git-root or
symlink resolution is the leading hypothesis, per
`docs/claude-local-plugin-development.md`'s "Why a copy and not a link"
section, but unconfirmed for this exact failure).

Independent of that root cause, `codex-pretool-guard.mjs`'s fallback should
not attempt human-override planning at all for a denial whose own guard
already supplied an agent-executable recovery action (e.g.
`guard-lifecycle-ready.mjs`'s "re-run inspect with intent session" text) —
override planning exists for denials that genuinely have no
agent-executable path, not as a universal wrapper around every refusal.

## Related

- `2026-08-09-restart-resume-hint-write-misses-the-project-prefix.md` — one
  concrete instance of this escalation.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
