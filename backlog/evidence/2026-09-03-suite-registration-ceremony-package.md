# Suite registration — measured, blocked on one signature, ready to apply

Produced by dispatch `NVA-B-SUITEREG-1`, 2026-09-03. The dispatch stopped
without changing anything, and this file exists so that stopping cost nothing:
everything the maintenance window needs is here, and the dispatch's own record
lives in the gitignored `evidence/` tree where it would not survive a fresh
checkout.

## Why nothing was changed

`harness/scripts/verify.mjs` is TP-3 protected. Registering any suite, or
promoting the detector itself, means editing its `TEST_SUITES` array, and that
edit needs the PO's external Ed25519 signature.

The dispatch's own context file said so — "this registration work belongs in a
maintenance window already scheduled with the PO" — and the briefing asked for
the edit anyway. That contradiction is the dispatcher's error: the item was read
only as far as its measurement section, and its "why it was not fixed on
discovery" note was missed. The dispatch caught it, stopped on the right stop
condition, and did the measurement work regardless so the ceremony is now a
single step rather than an investigation.

**No ceremony was seeded and none should be until the PO can sign immediately.**
CLAUDE.md is explicit that seeding and consuming must not be separated by other
work, and two earlier dispatches (`NVA-B-GUIDEDINIT`, `NVA-B-PUSHPREFLIGHT`) hit
this same wall and correctly stopped rather than spending one.

## What was measured, not assumed

All four unregistered suites were run standalone. All four pass.

| Suite | Result | Duration |
|---|---|---|
| `harness/scripts/print-verify-failures.test.mjs` | PASS | ~0.4 s |
| `plugins/pipeline-core/hooks/guard-push-release-tag-ancestry.test.mjs` | PASS (12/12) | 4.58 s |
| `plugins/pipeline-core/scripts/check-critic-skip-coverage.test.mjs` | PASS (9/9) | 0.15 s |
| `plugins/pipeline-core/scripts/measure-tofu-push-e2e.test.mjs` | PASS (9/9) | 14.08 s |

The fourth was briefed as the likely exception, on the reasoning that an
end-to-end push measurement probably does not belong in a gate. **That
assumption was wrong, and it was tested rather than trusted.** Reading its
source: no git remote, no URL, no network call in it or its onboarding sibling;
it builds a disposable temporary repository, generates keys locally inside a
temporary HOME, and answers its own prompts from a scripted driver. It needs no
network, no live push destination and no human, so it is a defensible gate
candidate.

Suite count 506 → 511 (four suites plus the detector as a gate step). Added
runtime ≈ 19.2 s against a gate that already takes ~23 minutes — mechanical, not
a cost decision.

## The exact change

One contiguous region, so a single ceremony covers all five additions. Replace
the final entry of `TEST_SUITES` in `harness/scripts/verify.mjs` and its closing
bracket:

```js
  { name: "project-onboarding-v3-unborn-head-tests", file: join(pluginScriptsDir, "project-onboarding-v3-unborn-head.test.mjs") },
];
```

with:

```js
  { name: "project-onboarding-v3-unborn-head-tests", file: join(pluginScriptsDir, "project-onboarding-v3-unborn-head.test.mjs") },
  { name: "print-verify-failures-tests", file: join(scriptDir, "print-verify-failures.test.mjs") },
  { name: "guard-push-release-tag-ancestry-tests", file: join(hooksDir, "guard-push-release-tag-ancestry.test.mjs") },
  { name: "check-critic-skip-coverage-tests", file: join(pluginScriptsDir, "check-critic-skip-coverage.test.mjs") },
  { name: "measure-tofu-push-e2e-tests", file: join(pluginScriptsDir, "measure-tofu-push-e2e.test.mjs") },
  { name: "suite-registration-check", file: join(pluginScriptsDir, "check-suite-registration.mjs") },
];
```

The last entry is the point of the exercise: it promotes the detector itself to
a gate step, mirroring the existing `verify-suite-registration-check` pattern
that its duplicate-id sibling already uses at ~`:593`. All five names were
grepped against `verify.mjs` first — no collisions.

**The request-sha256 seeded by the denied edit is not reproduced here on
purpose.** A ceremony must be built from a request seeded by the ACTUAL intended
retry, in the same session that consumes it; a stale digest copied out of an
evidence file is exactly the byte-identity mismatch CLAUDE.md documents as
burning a live PO signature for nothing. Seed a fresh one by attempting the edit
above, then build `plan` from that.

## Two things the dispatch declined to do, both correctly

It did not run the signature ceremony on its own initiative — nothing in its
briefing authorized spending a PO signature.

It did not use the detector's `DELIBERATELY_UNREGISTERED` opt-out as a
workaround. All four suites genuinely pass, so an opt-out entry would be a false
claim, and the detector treats a stale opt-out as fatal — which is the exact
2026-08-29 incident its own header warns about. Silencing the detector to make
its output green would have inverted the item's entire purpose.

## What this leaves

The gap the item names is unchanged: the detector's own tests are a gate step,
its result against the real tree is not, so the next unregistered suite is still
invisible to the gate. That stays true until the ceremony runs.

## Addendum (NVA-B-PREGATE-1, 2026-09-04) — one more suite for the same ceremony

`harness/scripts/pre-gate.mjs` (NVA-B-PREGATE-1, backlog
`pipeline.a-change-creates-an-obligation-elsewhere-that-only-a-gate-run-reveals`)
needed a companion test at `harness/scripts/pre-gate.test.mjs`. Editing
`verify.mjs` to register it was out of scope for that dispatch (same TP-3 wall
as above, same "no ceremony without an immediately-available PO signature"
rule), so this is a second, independent line for the same maintenance window
rather than a rewrite of the "exact change" block above — that block's anchor
(`project-onboarding-v3-unborn-head-tests`, still `verify.mjs`'s last
`TEST_SUITES` entry as of 2026-09-04) is left untouched so it stays a precise,
directly-appliable diff on its own.

```js
  { name: "pre-gate-tests", file: join(scriptDir, "pre-gate.test.mjs") },
```

Insert it anywhere in `TEST_SUITES` (order does not matter to the gate); after
the block already staged above is the natural spot. Name checked against
`verify.mjs` for collisions on 2026-09-04 (`rg -n 'pre-gate' harness/scripts/verify.mjs`
— no hits).

**Incidental finding, explicitly out of this dispatch's scope, not folded into
the line above:** the same live run that found `pre-gate.test.mjs` unregistered
also found `plugins/pipeline-core/scripts/capture-evidence.test.mjs`
unregistered (committed at `327db477`, unrelated to this dispatch,
`plugins/pipeline-core/scripts/capture-evidence.mjs` itself was mid-edit by a
concurrent dispatch in the same checkout at measurement time). Left for whoever
owns that file to add its own line; not measured or verified here.

## Addendum (NVA-B-REDCAPTURE-1, 2026-09-04) — the third and last line for this window

This is the line the addendum above left for its owner. Same TP-3 wall, same
maintenance window, same reason it is a separate block rather than an edit to
the "exact change" section: that section's anchor stays a precise, directly
appliable diff.

```js
  { name: "capture-evidence-tests", file: join(pluginScriptsDir, "capture-evidence.test.mjs") },
```

Note the binding differs from the `pre-gate-tests` line above and that is not a
typo: `pre-gate.test.mjs` lives in `harness/scripts/`, so it uses `scriptDir`,
while `capture-evidence.test.mjs` lives in `plugins/pipeline-core/scripts/` and
uses `pluginScriptsDir`. Both bindings exist in `verify.mjs` (lines 68 and 76,
read 2026-09-04). Name checked for collisions the same day:
`rg -n 'capture-evidence' harness/scripts/verify.mjs` returned no hits.

**Why all three lines belong to one window.** A live `node harness/scripts/pre-gate.mjs`
run on 2026-09-04 reported exactly two unregistered suites — `pre-gate.test.mjs`
and `capture-evidence.test.mjs` — alongside four honoured exclusions, zero
malformed and zero expired, and exited 1 on that cause alone with its other five
checks green (total 4147 ms). So these two lines plus the `verify.mjs` promotion
of the detector in the "exact change" block are the complete set: applying all
three in one ceremony takes the pre-gate from a red exit to a clean one, and
applying any subset leaves it red.

That run is also the item's own thesis demonstrated on itself. The
suite-registration check found, in 95 ms, an obligation created elsewhere by the
very deliverable it was checking — the kind of omission that otherwise surfaces
only after the full ~13-minute gate, if it surfaces at all.

## Addendum (NVA-B-NOCOMPACT-1, 2026-09-04) — a TP-4 edit for the same window

This one is not a `verify.mjs` line and not TP-3. It is recorded here because it
needs the same maintenance window and would otherwise have no home.

`plugins/pipeline-core/hooks/hooks.json` is TP-4-protected and its top-level
`$comment` documents all nine wired hooks. Its description of **hook 6** now
misdescribes the code, because the mechanism it names was removed on 2026-09-04
by PO decision (commit `868ee755`). The stale sentence reads:

> "(6) Stop stop-suggest — reads manifest+state and suggests the next phase/gate
> as a systemMessage, plus staged context-budget warnings from the statusline
> usage file (warn >=100k / overdue >=150k / emergency block >=170k with nag-cap
> <=2 consecutive blocks then downgrade, dedup marker against repeat chatter —
> plan 2026-07-07-retro-speed); the block tier is the ONLY decision-block this
> hook can emit and is persistence-guarded fail-open (write-then-emit)."

Everything from "plus staged context-budget warnings" to the end is now false.
The hook no longer reads the statusline usage file, no longer tiers, emits no
line mentioning context usage in any form, and no code path in it can produce a
`decision` field at all. The dedup marker survives, narrowed to
`{lastFingerprint}`, because it belongs to the surviving phase-suggestion
feature rather than to the removed tiering.

Replacement text for that entry:

> "(6) Stop stop-suggest — reads manifest+state and suggests the next phase/gate
> as a systemMessage, deduped against a session-keyed marker so an unchanged
> suggestion does not re-fire every turn (live chatter finding, plan
> 2026-07-07-retro-speed). It emits no decision of any kind and can never block:
> the staged context-budget tiering it used to carry (warn/overdue/emergency
> block, nag-cap, statusline usage read) was removed 2026-09-04 by PO decision —
> its thresholds were calibrated for a 200k window, sessions now run a 1M window
> with a one-hour prompt cache, and a forced compaction destroys the cached
> prefix and loses in-flight working state."

**Why this is not merely cosmetic.** This `$comment` is the only place the wiring
of all nine hooks is described in one piece, and it is TP-4-protected precisely
because it is load-bearing for a reader deciding what the guard family does. A
comment that describes an emergency brake which no longer exists is the same
defect class this repository has filed items about, in the one file an agent
cannot correct without a signature.

Nothing here blocks anything: the code is correct and its own header now carries
the accurate description. This is a documentation debt with a known route,
recorded so the window closes it rather than leaving it to be rediscovered.

## Addendum (NVA-B-EVSLOT-1, 2026-09-04) — a second TP-3 change, this one behavioural

Unlike the three registration lines above, this is not a list entry. It changes
what `harness/scripts/verify.mjs` does, and it is recorded here because it needs
the same signature window and would otherwise have no home.

**The defect, reproduced rather than argued.** `evidence/verify-latest.json` is a
single slot written by `writeEvidence()` as a bare `mkdirSync` + `writeFileSync`
— no run identity, no lock, no compare-and-swap. `verify.mjs`'s own header says
so: "ONE canonical path, overwritten each run — no registry (#2 CUT)." Two
concurrent runs therefore race, and the slower writer wins regardless of which
run the reader thinks it is looking at.

NVA-B-EVSLOT-1 built a bounded synthetic repro — two real child processes
performing that exact write shape against a scratch fixture — and it reproduces:
writer A exits 0 while the shared slot ends up holding writer B's commit. RED
capture: `backlog/evidence/2026-09-04-nva-b-evslot-1-repro-red.txt`.

**A forensic scan bounds how often it has actually bitten.** Of the four real
`verify.mjs` runs recorded under `.git/agent-pipeline/verify/runs/` for
2026-09-04, none overlapped in wall-clock time — they read as sequential, one
interrupted mid-flight. So the defect is live by construction but was not hit
today. Scan: `backlog/evidence/2026-09-04-nva-b-evslot-1-forensic-scan.txt`.

**What it does not endanger, established by grep rather than assumed.** The only
real consumers are `guard-push.mjs` and `push-prepare.mjs`, and both re-check
`commit` against the actual target on read. So a raced slot does not slip a stale
verdict past the push gate; the cost is a dispatcher trusting the file mid-run
and reading another run's result. That bounds the severity — it is confusing and
wasteful, not a security hole — and it is the reason this sits in a maintenance
window rather than demanding an urgent ceremony of its own.

**The exact change, narrowed from the item's candidate 1.** At both
`writeEvidence()` call sites, write `evidence/verify-<runId>.json` using a
per-run id — one is already available as `runVerifyJournal`'s default `runId`
parameter — and perform the write atomically as temp-file-plus-rename, matching
`verify-journal.mjs`'s own `atomicJson` helper rather than inventing a second
mechanism. `evidence/verify-latest.json` keeps its schema unchanged.

The dispatch that established all of the above changed nothing in `verify.mjs`
and stopped at the protected boundary, which is why the change is described here
instead of applied.
