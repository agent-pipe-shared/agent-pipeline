# Handover archive -- Prior handover — Verify is green in one run; candidate 0.6.0 local (2026-08-27)

> Rotated from `docs/state.md` on 2026-08-28 by `plugins/pipeline-core/scripts/handover-rotate.mjs` (ADR-0066).
> Section(s) archived: Prior handover — Verify is green in one run; candidate 0.6.0 local (2026-08-27).
> Summary: Verify green 471/471 in one run at candidate 5fd963fc; EP07 tree-dirtying cause named and fixed; +build stamp convention restored; AK-5 closed, AK-6 ready to re-dispatch; the open 0.6.0 combined-release decision carried forward to the current handover.
> Append-only once written; never edited by hand.
> Content below is verbatim except that relative markdown link target(s) were rewritten to keep resolving correctly at this file's directory depth (link text and all other content are untouched).

## Prior handover — Verify is green in one run; candidate 0.6.0 local (2026-08-27)

**READ THIS FIRST.** Verify passes 471/471, exit 0, in a **single** run with a
clean tree before and after — candidate `5fd963fc`. The two-run requirement is
gone, and its cause is named rather than worked around.

**The cause.** `lib/entrypoint.test.mjs` case EP07 pointed `CLAUDE_PROJECT_DIR`
at this repository while spawning the gate-strength guard twice, so the guard
recorded two REAL denials against the checkout and appended four governance
events plus an advanced `heads.json` on every run. That dirtied the tree
mid-flight, which made `security-scan` (all four adapters ERROR, exit 2) and
`candidate-binding` fail on an artifact rather than a defect. Identified with a
temporary probe in `appendOverrideDeniedLedgerEvent`, the only writer of
`governance/events/human/**` — two earlier attributions (`repair-map.test.mjs`,
`guard-gate-strength.test.mjs`) were disproved by measurement first. Fixed in
`a18cbafe` via `apply-pending-protected-edits.mjs` (TP-8), verified green in
`--preview` before the operator applied it.

**Stamp convention corrected.** The morning's `-prerelease` stamp was reverted
to the documented `+build` form (`9e23430f`). The reasoning behind it was wrong
about the mechanism: `docs/claude-local-plugin-development.md` states that
`claude plugin install` names the cache directory after the version string with
`+` replaced by `-`, so it is directory naming, not SemVer precedence. The same
passage explains the six-day staleness measured that morning — pinning does not
hold for a directory-sourced marketplace, the rsync had simply not been run.

**AK status.** AK-9/10/11 met (full green run; both manifests + `VERSION` at
0.6.0; every declared hook *wired* and byte-identical to the installed copy).
AK-14 filed for Nova B. **AK-5 is closed — this paragraph previously said the
opposite and was stale (corrected 2026-08-28).** It read: "the one true inert
guard — `guard-dispatch-budget.mjs` is built, 15/15, Verify-registered, but
`hooks/hooks.json` is on `NEVER_LIFTABLE_KERNEL_PATHS`, so no maintenance window
can wire it." It IS wired: `731ff1b8` added it to the PreToolUse manifest and
`1b45d6f9` then replaced a matcher that matched nothing. The installed manifest
carries three `guard-dispatch-budget.mjs` entries, byte-identical to the repo
copy. Left as a correction rather than a deletion because the false claim was
load-bearing — it named a blocker that no longer exists. **AK-6** is ready to re-dispatch
against `pipeline-user-v3.schema.json` (the first attempt used the pre-v3 schema
and would have flagged a correct calibration as drifted; withdrawn in `1d6dec55`,
scaffolding kept at `8316dbd8`).

**Open release decision, carried forward from the 2026-08-26 section rotated on
2026-08-27** (surfaced by that rotation's extraction pass, and recorded here so
it survives): the PO corrected on 2026-08-26 that **0.6.0 is a combined
Nova+Phoenix release number, not a Nova-only one** — Phoenix
([ADR-0043](../adr/0043-post-go-live-sprint-model.md)) was intended to land
alongside Nova under it. Undecided: intake Phoenix now and release combined, or
release Nova alone under a different number. `0.5.7` is not a candidate —
`VERSION` and every stamp already say 0.6.0. This does NOT block a local test
candidate stamped `0.6.0+...`; it blocks calling a published artifact "0.6.0"
without resolving it first. Nova B is confirmed NOT a blocker either way
(`specs/sprint-nova-epic/plans/nova-b.md` slice B3-A scoped its Agy touchpoint
as a deliberate non-functional stub, deferring the real work to the dedicated
Agy sprint since fetched).

**Backlog.** Five items filed, one closed (`0641d0d2`, ledger `6e20daa1`). One
inherited claim was corrected twice before it was right: "nine suites never run
in Verify" is **three**, not nine and not one — six are false positives from
`check-suite-registration.mjs`, which is blind to `verify.mjs`'s scoped
registration block. That is now its own item, alongside the three real gaps.

