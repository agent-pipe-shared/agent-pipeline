# Critic record: FANOUT-S5 Stop adapter (`72378df0b`) + FANOUT-S7b dispatch guard (`56c3c3969`)

Independent Critic, Opus 5.5 (route pre-check matched; effort not directly observed), ruleset
`0.7.0+claude.20261005202045.7170ed20`. Lane: functional-equivalent read-only, OS isolation not asserted. The
Critic could not persist `critic-notes.md` (GUARD-DEVPLAN-SHELL); this file, written by the Elephant from the
returned report, is the durable copy.

**Status: partial review, verdict withheld** (budget checkpoint at counted call 20 of 24). Not reached:
`guardrails/global.md`, `CLAUDE.md` hard rules, `resolveGitCommonDir`, `check-verify-suite-registration.mjs`, S2
`liveSlices` semantics. Six findings survived the evidence gate.

## F1 (major) — S7 implements only part of the dispatch-time refusal set (design §3.4, §3.10)

`fanoutDispatchFindings` (`lib/dispatch-policy.mjs:283-320`) yields only `FANOUT-NO-SLICE` (goldfish, unknown or
absent slice) and `FANOUT-SCOPE-OVERLAP` (against other live slices). Missing:
(a) non-ready slices, including the same slice already live (`:307` skips `id === entry.id`; test
"a slice never overlaps itself", `guard-dispatch-fanout.test.mjs:99`), and deferred/hold-po/cancelled/done slices
(no state check at `:288`); (b) dependency-blocked slices (no `dependsOn` check); (c) declared scope not checked
for containment in the queue entry's `writeScope` (`:302` uses the declared scope verbatim); (d) `FANOUT-NO-SLICE`
can never block (`hooks/guard-dispatch.mjs:240`; test `:176`); (e) enforce-mode refusal for undeclared scope while a
live dispatch exists replaced by a silent fallback to the queue scope (`:302`). Only (d) is disclosed in the commit.
In `enforce` this admits a double dispatch of one slice, a dependent launched before its dependency, evasion by a
disjoint `Write scope:` line, and queue bypass by omitting `Slice:`.

## F2 (major) — the Claude Stop adapter discards every non-block governor output

`hooks/stop-fanout.mjs:116` returns `""` unless `decision === "block"`; the governor's advisory text
(`lib/fanout-governor.mjs:487`) and the `FANOUT-NO-QUEUE` line (`:279`, advisory and enforce) are dropped;
`implementationPhaseActive` is never derived (only `requiresEnforcement`, `:105-107`). SF07
(`stop-fanout.test.mjs:145-149`) locks the gap in; the comment at `:12` contradicts design §3.3 (stop-suggest's
`systemMessage`/`additionalContext` is the advisory channel). Consequence: no advisory rung on Claude (W3 ladder
needs code), no queue pressure (§3.10). "Advisory text is not emitted yet" has no owner or expiry (QG-06).

## F3 (major) — authorship binding: `56c3c3969` touches a path its dispatch record does not cover

The commit adds `hooks/guard-dispatch-fanout.test.mjs` (+276); the stripped FANOUT-S7b record's
`report.changedFiles` lists only `lib/dispatch-policy.mjs`, `hooks/guard-dispatch.mjs` and the record
(`commits: []`). `agent-obligations.md:165-170` requires `report.changedFiles` to cover the committed paths.

## F4 (minor) — S7 hook-boundary paths have no executed evidence; their tests skip on any enrollment error

All three `hook:` cases skipped (EPERM) in the green log; `guard-dispatch.test.mjs` dies at setup (EPERM fsync).
`guard-dispatch-fanout.test.mjs:231-240` turns any exception (including `git init`, `:235`) or a non-enrolled
result (`:237`) into a skip on every platform, so the exit-2 refusal (`guard-dispatch.mjs:341-351`) and the launch
recording (`:352-354`) have never run. `quality-gates.md:125`, `:72-73`.

## F5 (minor) — the Stop adapter spawns `git` on every turn end before any early exit

`stop-fanout.mjs:91` resolves the common dir (`execFileSync("git", …)`, `:54-59`, no `windowsHide`) before the
`queuePath` check (`:94`), even with `PIPELINE_FANOUT_CONFIG` unset (`readConfig` → `{}`, `:43`). The S7 twin
checks `queuePath` first (`guard-dispatch.mjs:179` vs `:186-193`). Design §3.6, §8 native Windows, §3.1.

## F6 (minor) — the S7 suite puts fixtures in the ignored `scratch/`, absent in a fresh clone

`guard-dispatch-fanout.test.mjs:34` `mkdtempSync(join(repoRoot, "scratch", "fanout-s7-"))` at module top level
without creating `scratch/`, and `git init`s a nested repository in the working tree (`:235`); a fresh/disposable
clone throws ENOENT before registering any case. The S5 sibling uses `os.tmpdir()`. ADR-0063 `:50`, design §8.

## Examined and not flagged (summary)

`stop-eval` findings cannot feed the anti-loop counters (`fanout-governor.mjs:411-418`, `:478`); launch is recorded
only on exit 0 and every later refusal exits 2 (design note: a sibling hook or permission prompt refusing after
exit 0 would leave a phantom launch that §3.2 never auto-frees — raise at the bundled design review); separate pure
channel instead of `dispatchFindings()` (disclosed, equivalent); `goldfish-task.md` field 6 not edited (disclosed
split); env-var config surface interim (Q7/S8); test seam can only force fail-open; privacy (sanitised tokens, scope
hash, codes only); no secrets/network/host paths; English; GIT-03 trailers; S5 scope exact.

## Trajectory

Inconsistent: test-run claims match the logs (S5 RED 15/15 module-not-found → GREEN 15/15; S7b 12 pass / 3 skip;
dispatch-policy 37/1 DPT37; `guard-dispatch.test.mjs` crashes at setup), but the authorship of `56c3c3969` is
contradicted by its record (F3). Not verifiable: governor 33/33 unchanged, DPT37 pre-existing, guard-dispatch
failing before (no before-logs supplied).

## Elephant disposition

- F1, F4, F6 → fix slice FANOUT-F7 (`lib/dispatch-policy.mjs`, `hooks/guard-dispatch.mjs`,
  `hooks/guard-dispatch-fanout.test.mjs`).
- F2, F5 + governor Critic F1 (block only after a durable `block` append) → fix slice FANOUT-F5
  (`hooks/stop-fanout.mjs`, its test, the adapter-contract header of `lib/fanout-governor.mjs`).
- F3: acknowledged as a record gap. The orchestrator integrated and committed the diff-only result; the record's
  `changedFiles` was not reconciled with the committed paths before the commit act. History is not rewritten;
  future diff-only integrations check `changedFiles` against the staged paths before committing.
- Re-review after the fixes sees only the correction delta plus the not-reached items.
