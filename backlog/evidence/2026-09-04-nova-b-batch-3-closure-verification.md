# Nova B, batch 3 — independent closure verification

Three items closed together on 2026-09-04. For each, the dispatch's own report
was set aside and the deciding property was re-established here by running
something. That discipline is not ceremony: earlier in this same block a closure
of mine rested on a commit message, the code, and a passing test — all three
genuine, all three about the wrong layer — and the defect stayed live
(`backlog/items/2026-09-01-the-denial-trim-state-is-keyed-per-session-not-per-agent-as-its-comment-claims.md`,
correction section).

Commands below were run by the dispatching Elephant in the shared checkout, not
copied from any dispatch report.

---

## 1. `pipeline.an-invalid-channel-value-blocks-an-unrelated-alpha-ref-write`

Closed against `e07082b66bba6406b9a4ababb79c003655bbea0d`.

`node --test plugins/pipeline-core/scripts/pipeline-update-channel.test.mjs`
→ 36/36 pass, exit 0.

**The property most easily lost while decoupling** is that channel validation
still blocks *channel* operations — a decoupling achieved by deleting a check is
not a decoupling. The suite pins it explicitly in both directions:

> "unchanged: an invalid `pipelineUpdateChannel` value still blocks a channel
> operation, at plan, readback, and apply"

and the reverse,

> "a genuine alpha-ref problem still refuses with an alpha-ref reason code,
> decoupling did not remove validation".

The fix is at the cause rather than as an exception in the read path:
`readCalibration` was made field-agnostic and validation moved into the
field-specific read/plan/apply functions, with duplicate detection routed
through one shared helper that now applies symmetrically to both fields.

The briefed stop condition held. `readProjectPipelineUpdateAlphaRef`'s reason
codes landed hours earlier against a Critic finding and are untouched; reopening
them in the same breath would have made both changes unreviewable.

Trailers verified present and parsed:
`git log -1 --format="%(trailers:only=true,unfold=true)" e07082b6` →
`AI-Assisted: true`, `Dispatch: NVA-B-ALPHADECOUPLE-1 (goldfish)`.

---

## 2. `pipeline.a-change-creates-an-obligation-elsewhere-that-only-a-gate-run-reveals`

Closed against `a64b09eafb3986ae1259806f01d7321b638897e2`.

The item's Direction asked for a fast pre-gate running only the
obligation-detecting checkers, estimating ~8 s against the ~13-minute gate.
Measured here by running `node harness/scripts/pre-gate.mjs`:

    PASS generate-vendored-canon-tests (141ms)
    PASS reference-path-check (1029ms)
    PASS observation-governance-tests (203ms)
    PASS guard-maintenance-window-kernel-closure-tests (532ms)
    PASS doc-contract-check (2147ms)
    FAIL verify-suite-registration-check (95ms)
    Pre-gate: 6 check(s), 5 passed, total 4147ms -> FAIL

4.147 s — half the estimate. `node --test harness/scripts/pre-gate.test.mjs`
→ 5/5 pass, exit 0.

**The failure mode that mattered was not slowness but silent divergence.** A
pre-gate that disagrees with the gate is worse than none, because it teaches
confidence in a check that will not be the one that blocks. The first test is a
drift-guard that reads `harness/scripts/verify.mjs`'s own source and parses its
registered suites through `parseAllRegisteredSuiteFiles`, then asserts every
pre-gate entry is still registered there. It is not a second copy of the list; a
rename, removal or re-arg in `verify.mjs` turns it red rather than letting the
preview drift.

**It repairs nothing.** Confirmed by source read of the script and of all six
checkers it runs: the two `check` scripts write only when passed an explicit
`--report <file>` flag the pre-gate never passes, and the four `.test.mjs`
suites write only into their own `mkdtempSync` fixture directories. A pre-gate
that silently regenerated the vendored copy would remove the signal it exists to
give.

**Why the FAIL above is not a defect and does not block this closure.** The two
unregistered suites it names — `harness/scripts/pre-gate.test.mjs` and
`plugins/pipeline-core/scripts/capture-evidence.test.mjs` — are both real, and
both blocked on the same thing: `verify.mjs` is TP-3 protected and its
registration needs a PO signature ceremony. Both lines are staged in
`backlog/evidence/2026-09-03-suite-registration-ceremony-package.md`. Until that
window runs, `pre-gate.mjs` is adoptable as a per-check report rather than as a
clean exit-code gate.

That run is also the item's own thesis demonstrated on itself: the
suite-registration check found, in 95 ms, an obligation created elsewhere by the
very deliverable under test — exactly the class of omission that otherwise
surfaces only after the full gate, if at all.

The dispatch declined to silence `check-verify-suite-registration.mjs`'s
exclusions to make its own deliverable pass. That was the correct limit: a check
that gates your own implementation is never the thing you weaken to ship it.

---

## 3. `pipeline.guard-denial-messages-repeat-70-lines-of-boilerplate`

Closed against `6bfb9c3e1a8d96648e35365fb316ee73b2dd51b9`.

All three of the item's Acceptance bullets are now met, the third by this commit
and the first two by `b6d81f42` and the denial-trim work before it.

Verified by running:

- `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`
  → 226/226 pass, exit 0.
- `node --test plugins/pipeline-core/lib/copy-safe-command.test.mjs`
  → 31/31 pass, exit 0, including the column-bound and wrap-point tests. No
  line-wrapping regression: a rendered command is still copy-safe under
  `COPY_COMMAND_MAX_COLUMNS`.

**Nothing actionable was lost.** The `NOVA-LCR-HGO-1` assertions were not
modified and still pin the four-step order, `--repo`, `--request-sha256`, and
the in-session-versus-outside labelling. A shorter denial that no longer tells
the operator what to do would have been worse than the duplication, so this was
the property to check first, and it is pinned by tests the change did not touch.

The new assertion is
`NVA-B-DENIALBOILER-1: chat-mode denial renders each of its three ceremony
commands exactly once`, and `NVA-GF-COPYSAFE` was reworded to
`platform-determined`.

**Measured reduction:** signature-mode denial 110 → 71 lines; chat-mode 90 → 50.

**The mechanism, and why one step deliberately still renders twice.** Platform
is chosen per STEP, not per denial. The in-session steps (`plan`,
`prepare-authorization`, `emit-signature-digest`, and chat mode's `authorize`)
run through the same tool that produced the denial, so the platform is
determined rather than guessed. `authorize-by-signature` runs outside the
session on a machine nobody here can observe, so both renderings stay. That is
the item's own stop condition resolving as a finding rather than a bug: where
the platform genuinely cannot be determined at render time, the duplication is
load-bearing. `boundedCopySafeCommand` still computes all three forms; the
renderer only selects, so no reconstruction path was removed.

**Two things this closure does not claim.** The other four renderer callers
(`guard-testpath.mjs`, `guard-gate-strength.mjs`, and the Codex and Antigravity
pretool guards) and `guard-human-override.mjs`'s own `render-copy-safe` CLI
still emit unconditionally duplicated blocks; they were verified non-regressed
through the renderer's own default-path tests, not by re-running their suites,
and trimming them is separate work. The CLI case is deliberate — its own comment
calls it a give-me-everything escape hatch.

**A briefing defect of mine, recorded because the item carried it too.** The
briefing named `plugins/pipeline-core/scripts/guard-human-override.mjs` as the
emitter of the remediation block. It is not: the text comes from
`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`'s `humanOverrideRoute()`.
The item's own "Where it is" section had already declined to pin the emitting
function, and I carried that unpinned claim into the briefing as if it were
settled. The dispatch found the real emitter and changed the right file.

---

## Not closed in this batch

`pipeline.red-evidence-from-node-test-embeds-the-absolute-repository-path` is
implementation-complete across `327db477`, `d6640a42` and `290288ad` but stays
open here: it is a T1 security diff under `harness/review-protocol.md` §2.1, and
its independent Critic review was still outstanding when this batch was written.
Closing it now would be exactly the "done while a check is open" reporting that
`CLAUDE.md` forbids.
