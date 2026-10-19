# PO ceremonies pending (0.7.0 Alfred candidate)

Collected for the PO to run together; started only when the PO can sign at once (the request
is seeded, then consumed without interleaving work). Each entry names the protected file, the
exact change and why no agent can make it. Updated as entries are added or done.

| # | Kind | Protected file | Exact change | Reason | Status |
|---|---|---|---|---|---|
| C1 | human guard override (TP-1) | `plugins/pipeline-core/hooks/guard-git.test.mjs` | Line 226: case "R11 block add .env.example (documented errs-safe overblock)" expects ALLOW instead of BLOCK | PO decision D17 reverses exactly this case; the code landed in 801ce9e22 and this case is red until the flip | pending |
| C2 | author repair (PB-GUARD-HOOKS) | `plugins/pipeline-core/lib/guard/command-catalogue.mjs` | Add `RESUME_HINT_SCRIPT` to the `constants.mjs` import; in `sanctionedLifecycleScriptArgs`, after the `OBSERVATION_GOVERNANCE_BOOTSTRAP_SCRIPT` line: `if (script === RESUME_HINT_SCRIPT) return args[0] === "inspect" && exactRoot(args, root, 1) && args.length === 3;` | PF-21 (AC-123): the mandatory bootstrap read `resume-hint.mjs inspect` is refused in state `approved`. Its pin is parked at `scratch/parked/plugins/pipeline-core/lib/pins/resume-hint-inspect-is-admitted-in-every-lifecycle-state.test.mjs` and lands with the change | pending |
| C3 | protected registration (TP-13, PB-VERIFY-REGISTRATION) | `harness/verify-suites.json` | Register `plugins/pipeline-core/lib/pins/claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs` as a suite, in the same shape as the neighbouring `pin-*` entries | PF-26 end-to-end pin (1f91f18a5, 5/5) runs in Full Verify only once registered; every other agent-created pin is kept inside an already registered file to avoid this ceremony | pending |
| C4 | human guard override (TP-5) | `plugins/pipeline-core/scripts/pipeline-state.test.mjs` | Prepared drop-in at `scratch/c4/pipeline-state.test.patched.mjs` (hunk list `scratch/c4/edits.md`). It adds one shared `assertPresentRetired` helper (E12) and applies it to seven retired-route cases. Each original admit-side tail is kept verbatim behind `RETIRED_ROUTE_TAIL_LIVE = false` (E15). The late-verify fixture gets a git init and commits its calibration twins. Still to finish before the ceremony: retarget c-1 "ackmissing-submit-plan" per E13, and repair c-2, the late-verify `configure-verify` tail, per E14. Both are skipped with a marker in the current draft. The draft runs to the end with exit 0. | The file is protected; on 2026-10-19 it exits 1 after 4.5 s, so Full Verify measures nothing past the first retired case. It is one whole-file replacement, so it needs a single Write ceremony, not many Edit ceremonies | c-1/c-2 finishing |

Not a ceremony, but also waiting on the PO: a new candidate is stamped and pushed only when
the PO calls for one (D18).
