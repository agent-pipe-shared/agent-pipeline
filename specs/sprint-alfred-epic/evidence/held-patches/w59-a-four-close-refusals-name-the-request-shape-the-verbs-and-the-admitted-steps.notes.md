# w59 — four close-chain refusals name the request shape, the verbs, the evidence binding and the admitted steps (candidate 17, slice 14)

Applies on the nine-patch chain; text and help changes only, no change of what is accepted.

## What went wrong

The Antigravity greenfield run needed about fifteen separate commands to get from "implementation finished" to "feature closed", and at four points had to read pipeline source to learn
something a refusal could have said (report items 26, 27, 35, 38):

- `critic-dispatch-preflight.mjs` refused `--range` with `Unknown argument: --range` and no hint; the exact range is `--base` plus `--candidate`.
- `session-critic-finalizer.mjs` answered a malformed request with a bare `SCF-REQUEST` and a wrong verb with a bare `SCF-USAGE`; `--help` listed the verbs but not the closed request keys.
- The Critic addendum validator said only "evidence binding is invalid" for the `pipeline.critic-evidence-reference.v1` object.
- `planFeaturePackageTransition` answered `invalid-transition` without the chain; the agent asked for `implementing -> completed` in one step.

## Change

- Preflight: an unknown flag names the flags the preflight takes; `--range` additionally says to pass `--base` and `--candidate`.
- Finalizer: `--help` now prints the exact closed request keys and the schema versions; `SCF-REQUEST` points at `--help` (the CLI error detail is cut to one line of 200 characters, so the key list
  lives in `--help`); `SCF-USAGE` names the four verbs and the argument shape.
- Addendum: the refusal names the schema string and the five fields of `criticEvidence` with their binding rules.
- Package transition: the rejected plan carries `from`, `to` and a `repair` line with the chain and the admitted next states from the current one.
- Tests: the exact-text pin on `Unknown argument: --other` and the `SCF-USAGE` detail pin (D173) were updated to the new text; new cases for `--range`, the `--help` key list, the addendum text and the
  transition repair. 315 tests in the six touched suites pass.

## Not changed / not proven

- No orchestration: the close chain still needs the same commands in the same order. Whether `close-coordinator` should run the intermediate package transitions, the candidate Verify and the
  addendum itself is a design change and is left to the PO (candidate 17 or 0.7.1).
- Not changed: `dispatch-record-write.mjs` still demands repo-relative request paths (its refusal already says "not a literal repository-relative path"); `feature-package-apply --activate` stays
  unknown (the flag exists only on `feature-package-register`).
- Push threat model (report item 41): already named in the current source. `prepare-push-subject` and `approve-push` both say "run the materialize-push-threat-model subcommand ... then retry"
  (AC-3b); the report ran an older build. Nothing changed here.
- The text-only changes were checked by the assertions on the new text, not by a separate mutation run.
