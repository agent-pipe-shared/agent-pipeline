# Critic — tranche-1 package content, full review (staged ENVDUMP index; R7-6-P post-image `d0c820c66`)

Route claude-opus-5-5 (effort unknown), functional-equivalent-read-only. PARTIAL (checkpoint at call 18 of 20; three
calls lost to directory-scoped Grep refusals). Pass/fail withheld for both parts. Bound identities: ENVDUMP index blobs
`env-dump-lane.mjs` f03cfa195 (new), `evaluate.mjs` 9148de83e → 3c3e447da; R7-6-P post-image blob 7964fd426 vs live
b06f093d5.

## Findings (registry IDs)

- T1-F1 (minor): `env` in front of another dump command is not refused — `env-dump-lane.mjs:263` treats `env` as a
  dump only without a command operand and never examines the operand (`:200-238`), so `env printenv`, `env env`,
  `env FOO=1 printenv` pass this lane. ENVDUMP Proposal ("commands whose effect is to print the environment").
- T1-F2 (minor): the refusal fires on text, not effect — `/proc/…/environ` is matched in every word and redirect target
  (`:254-255`) and the node-eval rule matches any mention of the whole `process.env` object (`:24`, `:247`), so a
  read-only search for that path or a commit message naming it is refused with no retry action (`:306-311`).

## Not reached

The template clause (command strings are data) in `critic-review.md` / `goldfish-task.md`; generic override handling
for guard-lifecycle-ready denials; QG-06 and security guardrail text against the lane's documented wrapper gaps
(`:13-15`); five R7-6-P checks (imports, injected `gitCommonDirFn`, legacy tier read-only, anchor as root of trust with
the environment tier, agent-settable `PIPELINE_PO_APPROVAL_DIRECTORY`); authorship records.

## Dispatcher disposition (2026-10-08)

R7-6-P unreached checks, dispatcher self-verified: `resolve`/`isAbsolute` are imported (post-image line 378); the
resolver documents "resolving a directory grants no trust: the committed anchor set decides whether the key found there
may sign" (`po-human-approval.mjs:764`), and the anchor keeps the pair check against the committed anchor
(`CRITICAL-PROOF-LOCAL-ANCHOR-MISMATCH`, pin case 3b) — an agent-set environment directory therefore cannot introduce a
trusted key; the legacy tier is reached only through `resolveRepoScopedDirectory` with the injected `gitCommonDirFn`.
Run evidence against the post-image is produced at package apply time (between `apply` and `authorize-commit`), as the
tranche-1 README states. Ruling 40: T1-F1 is fixed inside tranche 1 (the lane is not yet committed; the fix lands in
the same staged package after a pin: `env` followed by a dump command or by `env` is a dump); T1-F2 is accepted for
0.7.0 as a fail-closed over-refusal and filed as a backlog item (refusal by effect, with a typed retry action). One
delta Critic over the T1-F1 fix plus the ENVDUMP not-reached items, then self-verify.
