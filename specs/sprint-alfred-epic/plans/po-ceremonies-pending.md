# PO ceremonies pending (0.7.0 Alfred candidate)

Collected for the PO to run together; started only when the PO can sign at once (the request
is seeded, then consumed without interleaving work). Each entry names the protected file, the
exact change and why no agent can make it. Updated as entries are added or done.

| # | Kind | Protected file | Exact change | Reason | Status |
|---|---|---|---|---|---|
| C1 | human guard override (TP-1) | `plugins/pipeline-core/hooks/guard-git.test.mjs` | Line 226: case "R11 block add .env.example (documented errs-safe overblock)" expects ALLOW instead of BLOCK | PO decision D17 reverses exactly this case; the code landed in 801ce9e22 and this case is red until the flip | pending |
| C2 | author repair (PB-GUARD-HOOKS) | `plugins/pipeline-core/lib/guard/command-catalogue.mjs` | Add `RESUME_HINT_SCRIPT` to the `constants.mjs` import; in `sanctionedLifecycleScriptArgs`, after the `OBSERVATION_GOVERNANCE_BOOTSTRAP_SCRIPT` line: `if (script === RESUME_HINT_SCRIPT) return args[0] === "inspect" && exactRoot(args, root, 1) && args.length === 3;` | PF-21 (AC-123): the mandatory bootstrap read `resume-hint.mjs inspect` is refused in state `approved`. Its pin is parked at `scratch/parked/plugins/pipeline-core/lib/pins/resume-hint-inspect-is-admitted-in-every-lifecycle-state.test.mjs` and lands with the change | pending |
| C3 | protected registration (TP-13, PB-VERIFY-REGISTRATION) | `harness/verify-suites.json` | Register `plugins/pipeline-core/lib/pins/claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs` as a suite, in the same shape as the neighbouring `pin-*` entries | PF-26 end-to-end pin (1f91f18a5, 5/5) runs in Full Verify only once registered; every other agent-created pin is kept inside an already registered file to avoid this ceremony | pending |

Not a ceremony, but also waiting on the PO: a new candidate is stamped and pushed only when
the PO calls for one (D18).
