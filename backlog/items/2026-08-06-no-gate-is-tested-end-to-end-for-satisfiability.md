---
schema: pipeline.backlog-item.v1
id: pipeline.no-gate-is-tested-end-to-end-for-satisfiability
type: workflow-improvement
owner: pipeline
status: "closed"
created: 2026-08-06
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "df670de3dd491160cf8c003ecdf2ee12b9669818"
closure_evidence: "guardrails/quality-gates.md"
source: "PO question, 2026-08-06: why does an agent keep stopping and asking instead of working under the operating model. Investigating produced a structural answer rather than a behavioural one — four gate defects in a single session, none found by the suite."
due: 2026-09-06
---

# Nothing checks that a gate is *satisfiable*, so gates drift into states no one can pass

## The pattern this session produced

Four defects, all on gate or guard surfaces, all found by hand or by a consumer
walk-through, **none by the 245-suite Verify gate**:

| Defect | How it was found |
| --- | --- |
| The push gate was turned on while the only sanctioned route to satisfy it — the publication executor — required evidence no script could produce | a `sprint_phoenix` handover, reading the installed build |
| `guard-push`'s remediation text named `approve-push` alone, which is necessary but not sufficient under `approval: required` | the same handover |
| The onboarding chain silently substituted the runner, so a Claude consumer got a Codex project | a smoke test in an empty directory, following the tool's own printed actions |
| A heredoc-stripping fix made the push gate **fail-open** | an independent Critic; the accompanying tests were green and blind to it |

Each was individually a different bug. Together they are one: **the enforcement
surface and the satisfiability of that enforcement are never checked against each
other.**

Verify asserts that units behave. It does not assert that a gate a project has turned
on can be passed by anyone at all. So a gate can be configured `required`, guarded,
documented, tested — and be a dead end, indefinitely, with every suite green.

## Why this also explains an agent stalling

The operating model is explicit that a recorded plan gate is an execution mandate and
that Critic dispatch, sequencing and ordinary block continuation are agent work, with
only two blocking human gates. `project/pipeline-state.json` carries
`planApproved: true` with a recorded `poGateAuthority`.

An agent that cannot tell a *configured* gate from an *unsatisfiable* one has no way to
distinguish "this is the human's decision" from "this is broken and I should fix it".
Every dead end then looks like a gate, and the safe-looking move is to ask. The
observed behaviour — repeated stopping on questions the operating model assigns to the
agent — is what that ambiguity produces.

Making satisfiability checkable removes the ambiguity: an unsatisfiable gate becomes a
red test, which is agent work, instead of an apparent decision point.

## Proposed fix

1. **A gate-walk test per configured blocking gate.** For each gate the manifest turns
   on, drive the sanctioned path end to end against a fixture and assert it reaches
   either "satisfied" or a typed refusal naming a *reachable* next action. A path that
   terminates in an action nothing can produce is a red test.
2. **Assert the remediation text is executable.** Where a guard prints a command, that
   command must exist and, run as printed, must advance the caller. `approve-push
   --by <name>` alone did not.
3. **A consumer walk-through in Verify.** `onboarding-runner-identity.test.mjs` already
   does this for one chain: execute each returned `nextAction` verbatim and assert an
   invariant. That shape found a defect no unit test saw; it should be the pattern for
   every emitted action chain, not one suite.
4. **Test what the change altered, not what it was meant to fix.** The heredoc
   regression shipped because its tests covered the intended repair (allow a commit
   mentioning the phrase) and not the altered surface (a command *after* the
   terminator). Worth stating in `guardrails/quality-gates.md` as a rule.

## Related

- `backlog/items/2026-08-06-onboarding-lifecycle-plan-hardcodes-the-codex-runner.md`
- `backlog/items/2026-08-06-release-preflight-has-a-builder-but-no-cli.md`
- `docs/state.md`, the two 2026-08-06 blocks, for the full defect record.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted; a first instance of proposal step 1 already
  exists. Stays open — the item's actual ask is the *systematic* version.
- **Rationale (found 2026-08-06 night):**
  `plugins/pipeline-core/hooks/lifecycle-gate-satisfiability.test.mjs` — its
  own header states verbatim: *"That is the general lesson recorded in
  `backlog/items/2026-08-06-no-gate-is-tested-end-to-end-for-satisfiability.md`,
  and this suite is its first instance."* Commit `c92eaca` ("feat(guard):
  make pipeline-start mandatory on Claude and the gate satisfiable") fixes
  both a not-mandatory-on-Claude defect and a not-satisfiable defect in
  `guard-lifecycle-ready.mjs`, and is registered in Verify
  (`lifecycle-gate-satisfiability-tests`, `verify.mjs:264`). Proposal step 3
  (consumer walk-through) also has a second, independent instance beyond
  the one the item already names:
  `guard-push.test.mjs`'s `PG12s1`/`PG12c`/`PGD23` and
  `critical-action-authorization.test.mjs`'s `PPA1`/`DPA1` build a real
  Ed25519 keypair, sign a real approval, and assert the push/deploy gate
  **reaches ALLOW** — proving satisfiability, not just refusal.
  **Still open, confirmed by direct check:** proposal step 2 (assert
  remediation text is executable, as a *general* check) and the
  generalization half of step 3 (every emitted action chain, not one or two
  hand-picked ones) have no repository-wide framework — `grep -rl
  "gate-walk"` across `plugins`/`harness`/`guardrails`/`backlog` matches
  only this item itself. Step 4 (a QG rule for "test what the change
  altered, not what it fixed") is not yet in `guardrails/quality-gates.md`;
  QG-07 ("reproduce before you fix") is adjacent but does not cover this.
  The item should be read as "generalize an already-proven pattern," not
  "invent a new one."
- **Assignment (if accepted):** step 1's first instance delivered by
  `c92eaca`. Generalizing steps 1-3 across every configured gate/action
  chain, and adding the step-4 QG rule, remains unassigned.
- **Date:** 2026-08-06

- **Update, 2026-08-11 (PO decision on scope):** presented alongside 7 other
  decision clusters (`2026-08-07-a-promoted-feature-can-never-pass-the-plan-gate.md`
  cites this item as its own second confirmed instance of the same gap).
  **Decision:** proceed with step 4 only for now — "C": codify "test what
  the change altered, not only what it was meant to fix" as a rule in
  `guardrails/quality-gates.md`. Steps 2 (assert remediation text is
  executable, generalized across every guard) and 3 (consumer walkthrough
  for every emitted action chain, not just the two existing instances) were
  NOT picked and remain open, undecided either way — narrower scope than
  this item's full systematic ask.
- **Assignment, 2026-08-11:** unassigned — small, well-scoped: add a new QG
  entry to `guardrails/quality-gates.md` for step 4. Steps 2/3's
  generalization stays exactly as unassigned as the 2026-08-06 entry above
  states.

## Re-verification, 2026-08-17

Re-checked `guardrails/quality-gates.md` directly: no QG entry states "test
what the change altered, not only what it was meant to fix". QG-07
(reproduce before you fix) and QG-09 (no unproven "cannot happen" claims)
are the nearest neighbors and neither covers it. Step 4 is confirmed still
not implemented. Stays open, current-scope: small, well-scoped, already
PO-decided — not deferred.

## Closure, 2026-08-18

Step 4 (the only currently-decided, currently-in-scope task) is implemented:
`guardrails/quality-gates.md` gained a new **QG-11 — Test what the change
altered, not only what it was meant to fix** entry, citing this item's own
heredoc-regression example as its "Why." That closes everything this item
had an active PO decision to do.

Steps 2 and 3 (the broader systematic generalization — a repository-wide
gate-walk/remediation-executability framework across every configured gate
and emitted action chain) remain genuinely undecided since 2026-08-11 ("NOT
picked and remain open, undecided either way"). That is real, unassigned
architecture work on gate/guard mechanics, not a same-session patch — it is
now deferred to the named, still-open **Sprint Alfred** ("Agent-first
architecture, mechanical governance, measurable rigor, and control
integrity", `docs/adr/0043-post-go-live-sprint-model.md`, 2026-08-17
amendment), matching the sprint already used for the closely related
preimage-baseline and shared-evidence-slot items filed in the same period.
Closing this item now that its one decided, in-scope task is done; the
deferred remainder is tracked as new follow-on scope under Sprint Alfred
rather than left open against this closed item.
