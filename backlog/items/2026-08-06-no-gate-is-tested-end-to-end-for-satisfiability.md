---
schema: pipeline.backlog-item.v1
id: pipeline.no-gate-is-tested-end-to-end-for-satisfiability
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-06
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
