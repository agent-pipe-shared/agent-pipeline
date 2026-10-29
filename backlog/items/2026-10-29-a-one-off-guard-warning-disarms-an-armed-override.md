---
schema: pipeline.backlog-item.v1
id: pipeline.a-one-off-guard-warning-disarms-an-armed-override
type: defect
owner: pipeline
status: open
created: 2026-10-29
priority: P2
release: 0.7.0
sprint: alfred
source: "Elephant, 2026-10-29, measured while diagnosing case 17 of plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs (Pipeline Author Repair), see specs/sprint-alfred-epic/evidence/held-patches/w7-codex-pretool-author-repair-private-state-mode-q1.notes.md"
done_when: manual
---

# A one-off warning in a guard child's stderr silently disarms a one-time override capability

## Evidence

`consumeHumanGuardOverride()` skips an armed capability whose recorded denial digests differ from the digests of the call being retried (`human-guard-override.mjs`, the `canonical(capability.denials) !== canonical(currentDenialDigests)` filter). The digest is `sha256(bindingDenialReason(reason))`, and `bindingDenialReason` strips only the human-override handoff headline and everything after it. The guard child's captured stderr is part of that reason.

Measured: the first call of a fresh clone made a guard child repair its private-state directory mode, which printed `(node:<pid>) [PB-ROOT-REPAIRED] Warning: ...` and the `--trace-warnings` hint into the denial reason. The capability armed from that denial recorded digest A; the replay, with the directory already repaired, produced digest B (same text without the two warning lines). No match, no consumption, a fresh denial offering the ceremony again. In a real session this spends the PO's signature for nothing, and nothing says why (the same silent failure class as the toolInputSha256 byte-identity case in CLAUDE.md).

Any once-per-process or once-per-state warning with a pid (a Node deprecation, the private-state repair advisory, a first-touch migration notice) can do this on the first denial after it.

## Wanted

- The bound denial reason excludes process-warning lines (`(node:<pid>) ...` and the `(Use \`node --trace-warnings ...\`)` hint), or the digest binds only the guard's own `BLOCKED (...)` block. Design latitude: which lines are noise; a RED case where the first call carries a warning and the replay does not must pass.
- Or the consume path names the denial-digest mismatch as `HGO-DRIFT` with `driftedChecks: ["denials"]` instead of skipping silently (the `denials` check exists in `driftChecks`, but the earlier filter drops the capability before it is evaluated).

## Not covered here

The test fixture side is held patch q1 (keeps the fixture directory at 0o700 so the case is deterministic); it does not touch production.
