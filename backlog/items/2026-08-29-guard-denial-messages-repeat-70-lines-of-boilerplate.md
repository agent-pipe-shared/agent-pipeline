---
schema: pipeline.backlog-item.v1
id: pipeline.guard-denial-messages-repeat-70-lines-of-boilerplate
type: workflow-improvement
owner: pipeline
status: closed
closed_at: 2026-09-04
closure_repository: self
closure_commit: 6bfb9c3e1a8d96648e35365fb316ee73b2dd51b9
closure_evidence: backlog/evidence/2026-09-04-nova-b-batch-3-closure-verification.md
created: 2026-08-29
sprint: nova-b
done_when: manual
source: "Claude/Windows self-audit section 5.8 from the 2026-08-29 three-runner greenfield test (finding F25 of scratch/greenfield-triage-2026-08-29.md); reproduced live in this dispatch by an accidental piped Bash command against a gate-strength-protected path."
---

# A guard denial for a lifted-override-eligible path prints ~70 lines of near-duplicated remediation text for ~5 lines of actionable content

## What happened

The audited session reports that guard denials on related commands repeat
near-verbatim boilerplate across roughly 70 lines, of which only three
commands and two placeholders are actually actionable — pure token cost on
every retry.

**Reproduced live during this dispatch.** An accidental `rg ... | sed -n
...` command in this same session (not the piped form the guard's own
diagnostic allowlist admits) triggered a `guard-human-override.mjs` denial
that printed, in full: the grammar explanation, then the `plan` /
`prepare-authorization` / `emit-signature-digest` / `authorize-by-signature`
command sequence, then a "bounded copy-safe rendering" of **each of those
four commands a second time**, once in a POSIX `CMD=...; eval "$CMD"` form
and once in a PowerShell `$CMD = ...; Invoke-Expression $CMD` form — i.e.
each of the four commands appears three times in one denial (once inline,
once POSIX-wrapped, once PowerShell-wrapped), for a message that is almost
entirely three commands and a `--repo`/`--request-sha256` pair repeated with
different literal padding.

## Where it is

`plugins/pipeline-core/scripts/guard-human-override.mjs` is the source of
the `plan` / `prepare-authorization` / `emit-signature-digest` /
`authorize-by-signature` remediation block reproduced above (function not
pinned to an exact line within this dispatch's investigation budget — the
denial text itself, not the emitting function, is what was captured live).
The general pattern — full grammar restatement plus one full remediation
block per denial, with no shorter form for a caller that has already seen
the grammar once in the session — is shared across the guard family in
`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (the same file this
triage's F24/F29 findings concern) and the human-guard-override machinery
above; both are candidates for the same trim, but only the reproduced
`guard-human-override.mjs` case was directly observed in this dispatch.

## Proposal

Two independent trims, either alone is worth doing:

1. **Drop the duplicated copy-safe renderings** unless the terminal width or
   runner actually needs them — or gate them behind a flag/heuristic (e.g.
   emit the wrapped forms only once, or only when the inline form is
   detectably going to wrap). Today they print unconditionally alongside the
   inline form for every one of the four commands, tripling their footprint
   for no gain in the common case where the inline form renders fine.
2. **Print the full grammar/remediation text on the FIRST denial in a
   session and a short form** (error code + one-line pointer to "see the
   full form printed earlier, or re-run `repair-map.mjs`") **on repeats of
   the same denial class** within the same session — mirroring how
   `templates/prompts/agent-obligations.md` already exists precisely so a
   dispatched agent does not have to rediscover the same guard behaviour by
   being refused repeatedly.

## Acceptance

- A denial for the same guard/reason within one session is measurably
  shorter on its second and later occurrence than the first, verified by a
  test comparing rendered denial length across two consecutive identical
  denials.
- The full grammar and full remediation text remain available on the FIRST
  occurrence (or via an explicit "show me the full form" request) — this is
  a token-cost trim, not a loss of actionable information; existing tests
  asserting the presence of specific remediation commands still pass.
- The reproduced `guard-human-override.mjs` triple-repetition (inline +
  POSIX-wrapped + PowerShell-wrapped, for each of four commands) is reduced
  to a single rendering per command in the default case, verified by a test.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment:** `sprint: nova` — Nova B work, not a 0.6.0 candidate blocker.
- **Date:**

## Progress note (2026-08-29, backlog sweep)

Commit b6d81f42 landed Part 1 -- boundedCopySafeCommand() now renders the
wrapped posix/powershell/cmd forms only when the inline command actually
exceeds the column bound, instead of always producing all three. Part 2 (a
first-denial-full / repeat-denial-short session-scoped trim) remains
unaddressed, explicitly out of scope for that dispatch by design.

## Closure

Closed 2026-09-04 against `6bfb9c3e1a8d96648e35365fb316ee73b2dd51b9`
(NVA-B-DENIALBOILER-1). Verification is in
`backlog/evidence/2026-09-04-nova-b-batch-3-closure-verification.md`.

All three Acceptance bullets are met: the first two by the session-scoped
denial trim and by `b6d81f42`, the third by this commit. Measured reduction:
signature-mode denial 110 → 71 lines, chat-mode 90 → 50.

Platform is now chosen per STEP rather than per denial. The in-session steps
(`plan`, `prepare-authorization`, `emit-signature-digest`, and chat mode's
`authorize`) run through the same tool that produced the denial, so the platform
is determined rather than guessed and one rendering suffices.
`authorize-by-signature` keeps both renderings: it runs outside the session on a
machine nobody here can observe. That is this item's own stop condition
resolving as a finding rather than a bug — where the platform genuinely cannot
be determined at render time, the duplication is load-bearing.
`boundedCopySafeCommand` still computes all three forms; the renderer only
selects, so no reconstruction path was removed.

`node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` passes
226/226 and `node --test plugins/pipeline-core/lib/copy-safe-command.test.mjs`
31/31, both re-run independently by the dispatcher. The `NOVA-LCR-HGO-1`
assertions were not modified and still pin the four-step order, `--repo`,
`--request-sha256`, and the in-session-versus-outside labelling — the check that
mattered most, since a shorter denial that no longer tells the operator what to
do would be worse than the duplication.

**Correction to this item's own "Where it is" section.** The remediation block
is emitted by `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`'s
`humanOverrideRoute()`, not by
`plugins/pipeline-core/scripts/guard-human-override.mjs`. This item declined to
pin the emitting function within its investigation budget and named the script
anyway; the dispatch briefing then carried that unpinned claim forward as if it
were settled. The dispatch located the real emitter and changed the right file.

**What this closure does not cover.** Four other renderer callers
(`guard-testpath.mjs`, `guard-gate-strength.mjs`, and the Codex and Antigravity
pretool guards) still emit unconditionally duplicated blocks. They were verified
non-regressed through the renderer's own default-path tests rather than by
re-running their suites, and the same trim there is separate work.
`guard-human-override.mjs`'s own `render-copy-safe` CLI is deliberately left
alone — its own comment calls it a give-me-everything escape hatch.
