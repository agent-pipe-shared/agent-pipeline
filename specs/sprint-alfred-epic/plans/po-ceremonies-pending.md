# PO ceremonies pending (0.7.0 Alfred candidate)

Collected for the PO to run together; started only when the PO can sign at once (the request
is seeded, then consumed without interleaving work). Each entry names the protected file, the
exact change and why no agent can make it. Updated as entries are added or done.

| # | Kind | Protected file | Exact change | Reason | Status |
|---|---|---|---|---|---|
| C1 | human guard override (TP-1) | `plugins/pipeline-core/hooks/guard-git.test.mjs` | Line 226: case "R11 block add .env.example (documented errs-safe overblock)" expects ALLOW instead of BLOCK | PO decision D17 reverses exactly this case; the code landed in 801ce9e22 and this case is red until the flip | pending |
| C2 | author repair (PB-GUARD-HOOKS) | `plugins/pipeline-core/lib/guard/command-catalogue.mjs` | Add `RESUME_HINT_SCRIPT` to the `constants.mjs` import; in `sanctionedLifecycleScriptArgs`, after the `OBSERVATION_GOVERNANCE_BOOTSTRAP_SCRIPT` line: `if (script === RESUME_HINT_SCRIPT) return args[0] === "inspect" && exactRoot(args, root, 1) && args.length === 3;` | PF-21 (AC-123): the mandatory bootstrap read `resume-hint.mjs inspect` is refused in state `approved`. Its pin is parked at `scratch/parked/plugins/pipeline-core/lib/pins/resume-hint-inspect-is-admitted-in-every-lifecycle-state.test.mjs` and lands with the change | pending |
| C3 | protected registration (TP-13, PB-VERIFY-REGISTRATION) | `harness/verify-suites.json` | Register `plugins/pipeline-core/lib/pins/claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs` as a suite, in the same shape as the neighbouring `pin-*` entries | PF-26 end-to-end pin (1f91f18a5, 5/5) runs in Full Verify only once registered; every other agent-created pin is kept inside an already registered file to avoid this ceremony | pending |
| C4 | human guard override (TP-5) | `harness/scripts/pipeline-state.test.mjs` | Replace the whole file with the prepared drop-in `scratch/c4h/pipeline-state.test.patched.mjs` (hunk ledger `scratch/c4h/edits.md`, hunks H2–H8). The hunks:<br>• the fixtures become git repositories under the checkout's scratch/;<br>• the plan-approval schema moves from v7 to v8;<br>• the PS08a v4 derivation is adjusted;<br>• the po-gate directory is created with mode 0700;<br>• RGt is retargeted per E18;<br>• HL-3a is retargeted per E12, with its tail dormant.<br>A scratch copy with only the import paths rewritten passes 530/530 (orchestrator run, 2026-10-19). Correction: an earlier C4 text named `plugins/pipeline-core/scripts/pipeline-state.test.mjs`. That file matches no TP pattern and is committed (5632bf6d9). | TP-5 protects this file. On 2026-10-19 it aborts after 0.3 s, so Full Verify measures nothing past PS06a. One whole-file Write ceremony: seed the request with the exact Write of the drop-in bytes, then retry that identical call | ready |
| C5 | human guard override (TP-7) | `plugins/pipeline-core/hooks/guard-testpath-override.test.mjs` | To be prepared read-only as a drop-in under E16: its chat-armed cases (line ~197 uses the removed `isattyFn`/`readLineFn` injection) arm through the signature route instead. | TP-7 protects this file. On 2026-10-19 it aborts with no summary | Drop-in in progress at `scratch/c5/`: 21 passed, 1 failed (OT13), 2 pending. OT21 and OT23 are typed pending under E25; that is a PO question at signing. OT24 is new: the chat route under a real pty. OT13 is being investigated. |

## PO manual tasks (no ceremony)

| # | Task | Why |
|---|---|---|
| T1 | Look in your real `~/.gemini/agent-pipeline/installed-plugin-attestations/` for `.json` / `.source.json` files that name a `scratch/agy-p18-02-first-start-*` path, and delete those by hand. | On 2026-10-19 the AC-111 pin was run once before its fix (2a51b7cdb). That run executed the real receipt writer against the real HOME. Agents may not read or change the real home, so only you can check. Every later run is confined to the fixture home. |

## PO decisions to take (collected, no action until decided)

| # | Question | Facts | Options |
|---|---|---|---|
| Q1 | How are the Alfred background Goldfish dispatches recorded for close? | No `dispatch-record-*.json` exists for any `ALF-*` dispatch since 2026-10-09. A background Agent call never leaves the pending host observation that `dispatch-record-write.mjs` needs: every launch hook reports `NGHF-PENDING-UNAVAILABLE`. Each commit carries `Dispatch: <id> (goldfish)` and `Commit-Act: orchestrator`, and the orchestrator verified each one with a counted run. The close coordinator's Critic-evidence check is scoped by dispatch records. | (a) Accept the trailer plus the orchestrator's counted run as the authorship record for this sprint, and give the close route a typed path for it (code change, Critic). (b) Re-run the remaining dispatches in the foreground, which writes records but serialises the work. (c) Write records retroactively. That is not possible without host observations and would be fabricated, so it is not recommended. |
| Q2 | A test run wrote into this checkout's live HGO ledger. | On 2026-10-19, one ALF-B4-HGO run with TMPDIR inside the checkout wrote one request and one `denied` audit entry under `.git/agent-pipeline/human-guard-overrides/`. Agents may not touch `.git`. Every later run uses a TMPDIR outside the checkout. | Keep the entry as a harmless audit trace, or remove it by hand. |

Not a ceremony, but also waiting on the PO: a new candidate is stamped and pushed only when
the PO calls for one (D18).
