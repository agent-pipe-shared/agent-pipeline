---
schema: pipeline.backlog-item.v1
id: pipeline.red-evidence-from-node-test-embeds-the-absolute-repository-path
type: defect
owner: pipeline
status: closed
created: 2026-09-02
closed_at: 2026-09-04
closure_repository: self
closure_commit: ddd356698f39bc3c4934ae97109290ba910b8385
closure_evidence: plugins/pipeline-core/scripts/capture-evidence.test.mjs
sprint: nova-b
tracking: "Nova B — reproduce-first RED evidence is required by briefings and by ADR-0063, and the standard way to capture it embeds a machine-specific absolute path that a hard rule forbids in commits. The fixup always arrives one commit too late, and history cannot be rewritten."
source: "NVA-REBDEAD-F5B, 2026-09-02: the dispatch's RED artifact carried this machine's absolute repository path seven times; the dispatch found it itself and sanitized the working-tree copy in a second commit (68c164e8), but the bytes remain in 79bc79b8. Second machine-path incident in the same session (the first, NVA-REBDEAD-1 finding F6, was dispatcher-side)."
done_when: manual
---

# RED evidence captured from a failing `node --test` run embeds the absolute repository path

## What happens

Briefings in this repository require reproduce-first evidence: capture the
failing (RED) state before the fix and the passing (GREEN) state after, as
tracked artifacts under `backlog/evidence/` per ADR-0063.

The natural way to capture RED is to run the suite and record its output
verbatim. For a failing `node --test` run that output contains Node's own
assertion stack traces, and those carry `file://` URLs holding the absolute
path of the repository on the machine that ran them. A GREEN capture does not,
because passing tests print no stack traces — so the trap fires only on the
artifact that must be captured first, and only in the direction nobody checks
twice.

`CLAUDE.md` forbids machine-specific absolute paths in docs, prompts, or
commits, without qualification. This repository is the Public Core and runs on
two machines with different local paths, which is the whole reason for the rule.

## Why the existing remedy is not sufficient

The remedy currently in use is a self-check at capture time in an ad hoc script,
plus dispatcher review. Both are discretionary, and both have now failed once
each in a single day:

- `NVA-REBDEAD-1` finding F6 — dispatcher-side, two occurrences, caught by an
  independent Critic review rather than by the capture.
- `NVA-REBDEAD-F5B` — dispatch-side, seven occurrences, caught by the dispatch
  itself during its own final check.

The second case is the instructive one. The dispatch behaved correctly at every
step: it noticed, it disclosed rather than hid, and it fixed the working tree in
a follow-up commit because its briefing forbade amending. The result is still a
rule violation that cannot be undone — `git commit` had already written the
bytes, and rewriting history is prohibited outright by the guard union. A
correction after the commit is structurally too late for this class of defect.

## Consequence, stated plainly

A machine-specific absolute path is reachable in this public repository's
history, in commit `79bc79b8`. The only mechanism that could remove it is a
history rewrite, which policy forbids. This is therefore a known exposure to be
recorded and accepted, not an open task with a route — and that asymmetry is
exactly why prevention has to move to capture time.

## Direction to evaluate

The check must run where the bytes are produced, not where they are reviewed:

1. A shared evidence-capture helper that every dispatch uses instead of
   hand-rolling one, which redacts the repository root to a stable placeholder
   at write time and refuses to write at all if any `/home/`, `/Users/` or
   drive-letter path survives.
2. Alternatively or additionally, a `PreToolUse` check on writes into
   `backlog/evidence/` and `specs/*/evidence/` that refuses a payload containing
   an absolute host path — the same shape as the existing consumer-safe-paths
   sweep, but fired before the write rather than as a later suite.

Option 2 catches hand-written artifacts too, which option 1 cannot. Neither is
recommended over the other here; both need to answer what a legitimate absolute
path in evidence would look like, if such a case exists at all.

## Affected artifacts

- `backlog/evidence/` and `specs/*/evidence/` — every tracked evidence artifact
- `harness/scripts/check-consumer-safe-paths.test.mjs` — the nearest existing
  check; it passed on this candidate, so its scope does not cover this case
- `CLAUDE.md` — the hard rule this violates
- `docs/adr/0063-repository-directory-contract.md` — the rule that puts tracked
  evidence in the repository in the first place

## Closure, 2026-09-04

Direction 1 shipped: `plugins/pipeline-core/scripts/capture-evidence.mjs`
(NVA-B-REDCAPTURE-1, 2026-09-03/04, hardened through two follow-up rounds —
NVA-B-REDFIX-1 and NVA-B-REDFIX-2 — plus a same-day pass closing review
findings F1/F2/F4/F5/F6). It redacts the repository root and home directory
from a wrapped command's stdout/stderr (plain-path and `file://`/percent-encoded
forms alike) BEFORE the bytes reach disk, and refuses to write anything at all
— artifact body or its own CLI output — if a known host-path shape (POSIX
home, macOS home, Windows drive letter, each in literal and percent-encoded
form) survives redaction. `templates/prompts/goldfish-task.md`'s standard DoD
checks already mandate this tool for capturing evidence, so a briefed dispatch
following the template gets the fix by default. `node --test
plugins/pipeline-core/scripts/capture-evidence.test.mjs` — 35/35 pass, exit 0
(re-verified 2026-09-04 before closing this item).

Direction 2 (a `PreToolUse` guard catching a HAND-written evidence artifact,
which a capture tool structurally cannot reach) was deliberately split out
before this closure rather than folded in or dropped:
`backlog/items/2026-09-04-a-hand-written-evidence-artifact-can-still-carry-an-absolute-host-path.md`,
still open, three of its own design questions unanswered. This item closes on
Direction 1 alone, which is what it was actually filed for (a `node --test`
RED capture's `file://` stack-trace path) — Direction 2 was always framed as
"alternatively or additionally," never as a joint precondition for closing.
