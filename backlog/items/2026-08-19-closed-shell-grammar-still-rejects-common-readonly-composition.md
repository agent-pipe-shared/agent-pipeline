---
schema: pipeline.backlog-item.v1
id: pipeline.closed-shell-grammar-still-rejects-common-readonly-composition
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-19
source: "PO question, 2026-08-19: 'sollen wir die bash grammatik reibung nicht etwas auflösen und sehr übliche dinge einfach rein nehmen ... die sehr oft genutzt werden?' — asked live after the running Critic delta-review dispatch (and the Elephant itself, same session) repeatedly hit GUARD-PARSE-UNSUPPORTED/GUARD-REDIRECT-UNAPPROVED on ordinary read-only command shapes."
---

# The closed shell grammar still rejects several very common, genuinely read-only command shapes — narrower than `2026-07-26-readonly-command-guard-classification.md` already fixed

## Description

`2026-07-26-readonly-command-guard-classification.md` closed today (commit
`6a58725b`) by extending `guard-lifecycle-ready.mjs`'s bounded-pipeline
exception family to grep-to-grep/grep-to-head shapes. That fix does not cover
several OTHER read-only shapes that this session hit repeatedly, both from the
Elephant session directly and from a dispatched Critic subagent, on the SAME
day the grep-pipeline fix landed:

1. **Simple `&&`-chained read-only git/inspection commands**, e.g.
   `git rev-parse HEAD && git log --oneline -5 && echo "---status---" &&
   git status --porcelain | head -30` — refused as `GUARD-PARSE-UNSUPPORTED`
   even though every individual command is read-only and none touches
   pipeline-source, marketplace, or plugin-install paths.
2. **`mkdir -p <path> && ls -la <path>`** — a scratchpad-setup pattern a
   dispatched Critic used for its own required fresh-scratchpad-subdirectory
   discipline (`templates/prompts/critic-review.md`'s "Scratchpad isolation"
   clause) — refused the same way.
3. **`2>/dev/null` / `2>&1` stderr redirection on an otherwise read-only
   probe command** (e.g. `grep -rl "pattern" backlog/items/ 2>/dev/null`) —
   refused as `GUARD-REDIRECT-UNAPPROVED`, even though suppressing stderr on
   a "does this exist" probe is a standard, harmless shell idiom.

None of these are edge cases — they were each hit within the same single
session, by more than one distinct actor (Elephant + a dispatched Critic),
doing ordinary read-only inspection work. The cost is real: every rejection
burns a tool-call round-trip and, per the closed-grammar discipline this repo
already documents (`harness/session-bootstrap.md` boundary rules), the
correct recovery is "split into separate simple commands" — which works, but
means routine multi-step read-only inspection (the exact kind a Critic's own
mandated bootstrap steps require) costs 3-5x the tool calls it should.

## Triggering situation

2026-08-19, live during the HGO fail-closed-arming design's Critic round-2
(delta) review dispatch: the dispatched Critic hit `GUARD-PARSE-UNSUPPORTED`
twice in its own opening bootstrap steps (scratchpad `mkdir -p && ls`, then
`git rev-parse HEAD && git log --oneline -5 && echo ... && git status ... |
head`). The Elephant session hit `GUARD-REDIRECT-UNAPPROVED` on a `grep -rl
... 2>/dev/null` probe in the same window. The PO noticed the pattern live
and asked whether the grammar should be widened for "very common things that
get used very often."

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (the closed shell
grammar classifier: `isReadOnlyDiagnosticCommand`,
`isForbiddenCrossRepositoryMutation`, `isBoundedGrepPipeline` and neighbors —
the same functions `2026-07-26-readonly-command-guard-classification.md`'s
fix touched) and its test suite.

## Proposal

Not designed here — needs the same rigor as any guard-lifecycle-ready.mjs
change: a bounded Goldfish-deep dispatch through the normal plan gate (never
a freehand guard edit), and a Critic review before landing, exactly as this
session's other guardrail work has been run. Candidate direction, narrowly
scoped to what was actually hit (not a general "allow more shell features"
relaxation, which would reopen the exact risk the closed grammar exists to
bound):

1. Extend the bounded-composition exception family (the same shape
   `isBoundedGrepPipeline` already established) to a SMALL, explicit allowlist
   of read-only, non-mutating commands chained with `&&` — `git rev-parse`,
   `git log` (read-only subcommands only), `git status`, `echo`, `ls`,
   `mkdir -p` (restricted to paths already permitted for agent writes —
   scratch/, scratchpad, `.claude/worktrees/**` — never a bare `mkdir -p`
   anywhere), and the existing grep-to-grep/grep-to-head pipeline shape as a
   trailing stage. Fail closed on anything outside this exact set, exactly as
   the existing fix does for grep pipelines.
2. Admit `2>/dev/null` (and, narrowly, `2>&1`) as a trailing redirect on a
   command already classified read-only by the rules above — never on a
   command that isn't independently already admitted.
3. Preserve every existing fail-closed guarantee this file's own tests
   already assert: unknown shell structure, any mutation, any pipeline-source
   access, any marketplace mutation, any plugin-install path stay refused
   exactly as today. This item does not ask for anything to become MORE
   permissive than "the exact same read-only commands that already pass
   individually, now also chainable."

Add closed command-shape fixtures (mirroring `2026-07-26`'s own approach)
proving both directions: the newly-admitted shapes pass, and a superficially
similar but actually-mutating or cross-root variant of each still fails
closed.

## Triage

Not yet triaged — logged same-session per the PO's live question. Sequencing
note: this session currently has an in-flight Critic delta review and pending
implementation dispatches for the HGO fail-closed-arming fix; this item
should not be picked up mid-flight alongside that guardrail work (avoid
running two independent guard-editing dispatches against overlapping
`guard-*.mjs` machinery concurrently) — natural next item once the current
HGO batch lands.
