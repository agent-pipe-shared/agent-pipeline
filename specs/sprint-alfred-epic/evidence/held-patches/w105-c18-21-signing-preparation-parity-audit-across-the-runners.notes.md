# w105 - C18-21 signing-preparation parity audit across the runners

## What

One new docs file, `specs/sprint-alfred-epic/plans/candidate-18-drafts/signing-parity-audit-2026-11-02.md`: a read-only audit
with a table per signing kind (push, deploy/publication family, critic-bound, design approval, human-guard override) and per
runner (Claude, Codex, Antigravity), then eight ordered gaps (G1-G8) with file, minimal fix and size. No code changed.

## Why

PO decision 2026-11-02: the Antigravity finding about a missing short signing wrapper is answered by parity, not a new script.
The agent runs every preparation command on every runner and is told so; only the sign-off is the PO's. The audit shows the
guard admission is shared code, so the differences are texts and docs. Largest gaps: no agent-side `authorize-critical` builder
for deploy/publication/release-preflight (G1), and the signing refusal names no next command (G3).

## Criterion binding

AC-262 is the closest existing accepted criterion. The PRD and the Spec are unchanged.

## Apply order

The patch is a delta on the chain base (23a4e5ae92d0a0e95d22436d9ce22e9fa0cc93d3), which already contains the held patches w83
and w100. Apply w83 and w100 first. `git apply --check` against the real checkout is expected to fail until then; against the
chain base it passed (exit 0). The check test does not run `git apply`.

## Not changed

Every guard, hook, script, config and doc other than the one new audit file. No signing command was run, no request seeded,
no human-guard-override state touched.

## Not proven

Codex and Antigravity host behaviour (second classifier, wording of the design-approval refusal on Claude and Codex, Claude
wording of the external-operator branch) was not run live: listed as "not established" in the audit, section 4.
