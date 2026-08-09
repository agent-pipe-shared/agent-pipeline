---
schema: pipeline.backlog-item.v1
id: pipeline.claude-greenfield-run-happy-path-findings
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Command-level analysis of the PO's Claude-with-Pipeline greenfield run of 2026-08-09 (transcript ad321d5e), read from the session log. 50 failing tool results across the run."
due: 2026-08-16
---

# What the Claude greenfield run adds: the language gate bites, and the push gate does not

Companion to
`2026-08-09-agents-read-the-pipelines-source-because-nothing-describes-its-interface.md`
(Codex) and `2026-08-09-the-push-gate-is-silent-in-every-consumer-project.md`.
50 failing tool results; these are the ones that are not already filed.

## 1. `PO-GATE-PRD-LANGUAGE-MISMATCH` blocks `submit-plan`, and both exits are unattractive

`submit-plan` refused with `PO-GATE-PRD-LANGUAGE-MISMATCH`. The library's own
comment, which the agent then read, states the position exactly:

> this state has two legitimate resolutions: change the configured language to
> match the document, or change the marker to match the config

Both are real edits to bound artifacts, and the session had just been told by the
PO to work in German. This is the enforcement end of the drift already filed as
instance 2 of the promotion item: the kickoff freezes `po-language: en` before
the PO's answer exists, the promoted PRD carries `de`, and the plan gate is where
the disagreement finally surfaces — several steps after the point where it could
have been prevented, and after both documents are byte-bound.

**This is the "Effektivität durch Sprache verloren" the PO reported**, and it is
not the agent being slow: the gate is correct, it just fires at the far end of a
chain whose near end never asked.

## 2. The agent tried to satisfy the push gate and could not

`approve-push` was attempted and refused:

> `Error: approve-push requires --by, --remote, --destination, --proof-request, --proof-authority and --proof.`

So the session knew a proof was required, went looking for the route, and hit a
six-parameter signature ceremony it cannot complete from inside a session — which
is correct by design. **And then the push succeeded anyway**, because the gate
that should have stopped it was absent from the manifest. Filed separately; this
is the evidence that the agent's behaviour was not negligence.

## 3. `--help` does not exist on the state writer

> `Error: unknown command "--help". Allowed: set-feature, submit-plan, approve-plan, reopen-design, seal-plan-approval, set-phase, set-gate-e…`

The refusal does list the verbs, which is better than nothing, but only after a
failed call. Same class as the Codex run reading `pipeline-state.mjs` source to
find flags. `ruleset-freshness.mjs` produced the same shape (`exit 64`, usage
line) that `repository-freshness.mjs` produced for Codex.

## 4. Two authority-staleness refusals inside the approval chain

`PLAN-APPROVE-AUTHORITY-STALE` and `PLAN-SUBMIT-STATE-INVALID`, both with "zero
mutation". Fail-closed and correct; worth measuring whether the sequence that
produced them is one a correct session can avoid, or whether the chain has an
ordering an agent cannot infer.

## 5. The same two non-Pipeline stops as the Codex run

`Author identity unknown` on the first commit, and a `not a git repository`
attempt. Onboarding configures neither and warns about neither, so both runners
lost a PO turn to it.

## What worked, and is worth not breaking

`guard-devplan` refused an implementation write before plan approval, and GIT-03
refused a commit message. The enforcement family is alive and precise — which is
what makes the silent push gate a composition defect rather than a broken hook.

## Run telemetry

| Axis | Claude + Pipeline | Codex + Pipeline | Claude, no Pipeline |
|---|---|---|---|
| Wall | 1 h 11 m 51 s (API 51 m 48 s) | ~33 min | 10 m 34 s |
| Cost | **$26.27** | not priced by the runner | $1.62 |
| Output tokens | 173.3k | 51.1k | 21.6k (CLI figure) |
| Cache read | 36.2m | 7.0m | 0.9m |
| Lines changed | +2,435 / −35 | +656 | +1,030 |

Claude with the Pipeline cost **16× the no-Pipeline control** and produced the
most lines of the three — the deadlock and the language round-trips are in that
number, so it is a measurement of this run, not a property of the Pipeline. The
honest comparison stays: same runner, same brief, with and without. That pair is
$26.27 against $1.62.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
