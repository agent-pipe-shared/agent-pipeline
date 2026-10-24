# K147-FV-HOST-REGISTRY notes (Goldfish, Sonnet 5.5, ruleset 0.7.0+claude.20261023185750.bd9ee06)

Status: partial. CADH001 fixed (GREEN alone); CCH136/CCH137 NOT fixed; pin not yet run RED/GREEN; nothing committed in the clone (changes are uncommitted in scratch/clones/k147); no k147-check clone made.

## CADH001 cause chain (measured, two causes, both needed)
1. Nested registration inside the BEGIN ticket (K145 notes): the driver's synchronous prefix reaches createRegisteredManagedJournal. Fix = option (a) variant: in model-family-host-store.mjs launchUnregistered an AsyncFunction native driver is entered via Promise.resolve().then(...), i.e. after the ticket closed. A sync driver stays sync (existing test "legacy synchronous driver callers stay synchronous" and line ~335 depend on it). Declaring managed-codex creations in the transition scope was NOT needed: the settle scan covers only the model-family-host namespace.
2. After step 1 the next failure was launch code SDC-AUTHORITY-UNAVAILABLE: the deferred continuation inherits the AsyncLocalStorage store of the already closed boundary, so withSessionAuthorityBoundary (session-authority-registry.mjs line 246) called back with a dead token and acquired no lock. Fix: treat the stored context as active only while boundaryBrands.has(active.token); otherwise acquire a fresh boundary. Checks unchanged for live nested boundaries.
Evidence: base RED scratch/agent-out/K147-evidence/base-cadh.txt (exit 1); step-1-only still RED scratch/k145-raw/fix1c/ (assertion shows launch SDC-AUTHORITY-UNAVAILABLE); both fixes GREEN scratch/k145-raw/fix2/ (exit 0, 1/1).

## Bare catch (model-family-runtime-host.mjs:178)
Not changed: returning the inner error code changes a result shape other callers may validate. Reported only. CADH001 now asserts executeInitial result (code/outcome/launch code) first.

## CCH136/CCH137: NOT diagnosed to a fix
Still RED with both fixes (scratch/k145-raw/cch1/, 135/137 pass): "repository mutation observed during normal Critic run" at codex-critic-host.mjs finalizeNativeCritic line ~1988; CCH137 diagnostics: reviewPreparedMatch=true, reviewDetailsChanged={}, protectedChanged=["candidate"]. This is NOT the CADH001 cause (different path, fix does not change it). Stop condition reached for that part (budget); next step: probe which candidate path changes between prepare and finalize (fingerprint diff), test CCH137 alone.

## Pin
Added in model-family-host-store.test.mjs ("K147 an async native driver runs after the BEGIN ticket closed ..."): asserts the registry lock is absent in the driver prefix and present inside a boundary opened in the continuation. The suite run (scratch/k145-run.mjs k147 store1) exceeded 600 s and was still in the background at close; pin RED-on-base and GREEN-after NOT verified. Note: the pin pins the two causes, not the briefed "declared creations" wording (option (a) with declared scope was not needed).

## Files
Protected diff (classification of the host-store file as protected is an assumption): lib/session-authority-registry.mjs, lib/model-family-host-store.mjs. Unprotected diff: lib/model-family-host-store.test.mjs, scripts/codex-design-advisor-host.test.mjs.
Dispatch record deviation: none written (PO list row 59).

implementation not complete; verify, independent Critic read, operator commit of protected parts and PO acceptance pending
