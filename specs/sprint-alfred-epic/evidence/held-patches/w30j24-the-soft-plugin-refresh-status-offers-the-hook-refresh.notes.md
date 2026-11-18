# w30j24 — a soft plugin-refresh-required status caused only by the version mismatch offers the same one typed hook refresh (C11 / SM-14, PO tile 2026-11-18 "yes", C30J-J24)

Applies AFTER the integrated 30j tree (the clone int30j): the patch is a delta on files that tree already changes, so it does not apply to the real repository until that tree is (`apply --check` is exit 0 against `scratch/agent-out/c30g/int30j`, exit 1 against the real HEAD, as expected). The check test therefore never runs `git apply` against the repository. Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged. The Critic is suspended by the PO for candidates of this repository and no Full Verify runs, so this change is verified by tests only, not by a live round.

No stored status, no record shape, no digest or key byte, no gate, signature, approval, push approval, Critic evidence, security scan or audit bundle semantics changed. The change is derived from the inputs `status` is already derived from.

## What changed (production)

`scripts/pipeline-start-preflight.mjs`, three small edits:

- The call site passes `softVersionMismatchOnly = installedIdentity?.ambiguous !== true && !attestationFailed && installedVersion !== null && installedVersion !== version`. These are the same three inputs that make `status` `plugin-refresh-required` (`plugin-attestation-required`, from a failed installed-plugin attestation, is decided before and never reaches this branch).
- `planMandatoryHookRefresh` offers the action when `baseStatus === "plugin-refresh-required"` AND `softVersionMismatchOnly` (and, as before, role is not Goldfish/Critic and the mandatory-hook readback is `ready` with `refreshAvailable`). In that case the returned status is the unchanged gated (soft) status, not `hook-refresh-required`; the action is the identical typed one (`refresh-mandatory-hooks.mjs --root <root>`, expected readback `pipeline.mandatory-hook-refresh.v1` `ready`, `refreshes`).
- `nextAction` takes the refresh action when the result status is `hook-refresh-required` OR the soft `plugin-refresh-required` with an action. The exit code stays 0 for the soft status (the allowlist is unchanged); nothing runs inside the preflight.

Kept unchanged, each with a test: `plugin-attestation-required` and its closed human recovery (J8 case, still green); a failed attestation (with or without a version mismatch) and an ambiguous registry never get the action; a missing hook beside a stale one is not `ready`, so no refresh is offered before the coordinator step; Goldfish and Critic neither receive nor execute it (the refresh script is not named anywhere in their envelope); the guard's `HOOK-SNAPSHOT-STALE` refusal text and the install/refresh scripts are untouched.

## Docs (restated, same journey, one more case)

`skills/pipeline-start/references/onboarding-recovery.md` and the matching lines in `skills/pipeline-start/SKILL.md`: "continue only on `ready`" still holds for the hard/hook statuses; a new paragraph states the soft case (execute the one action once, rerun, then continue under the soft status, which no longer lists stale hooks and never becomes `ready` by this step; the confirmation line still notes the soft advisory). The payload-budget suite (SKILL.md bytes) is green.

## Which tree the refresh rebinds the hooks to in that state (the open "Not measured" of the J8 notes)

Measured by `scripts/mid-session-hook-refresh.test.mjs` case MSH003 with the real, un-injected installers: the plan and the apply of a refresh without an injected library target the plugin library next to the refresh script (`DEFAULT_PLUGIN_LIB_DIR`, the LOADED tree), and the typed action is the loaded plugin's own script. Hooks bound to another tree (here a stand-in for the registry-installed copy) read stale against the loaded tree, are rebound to a private runtime snapshot of the loaded tree, read current afterwards, and a second run changes nothing. Neither the plan nor the apply reads the registry, so under the soft version-mismatch status the refresh rebinds to the LOADED plugin, the same tree the staleness was measured against. This is a consequence for the PO to know: after the refresh the hooks follow the loaded plugin, not the registry's installed copy, until that copy is updated; the soft advisory stays for exactly that reason.

## Tests (clone, `test-in.mjs`, one at a time)

Test-first: the new pin cases were written first and run RED against the unchanged production code (P7 offer case and the P7 journey failed on `advisory` vs `command`; the four keep cases were green before and after, as keep cases must be). Production was then changed. The preflight case `C30J-J24` was written after the production edit (the failing-first proof is the pin file's); it is a regression guard for the same behaviour.

- `lib/pins/bootstrap-should-refresh-hooks-when-the-plugin-updated.test.mjs`: 27 of 27. P7 restated per QG-04: the J8 pin asserted "no action under a soft status" and said itself that this was "not a PO-mandated boundary" pending the open decision; the PO decided, so the offer case and the journey now assert the action and the soft status after the refresh (no stale report). New keep cases: Goldfish/Critic, failed attestation (mismatch and no mismatch), ambiguous registry, missing hook beside a stale one. The harness gains optional `registryText` and `observation`; the two existing RED mutants had their anchor string restated to the new condition (same mutation); the RED P7 mutant now removes the whole base-status condition and is caught under a failed attestation; a second RED P7 mutant ("offer for every soft cause") is caught by the failed-attestation and ambiguous cases; a third mutant (role check removed) changes what a Goldfish is given, which the role keep case rejects.
- `scripts/pipeline-start-preflight.test.mjs`: 107 of 107 (was 106): case `C30J-J24`.
- `scripts/mid-session-hook-refresh.test.mjs`: 3 of 3 (was 2); the case-count guard was raised to 3.
- Neighbours run unchanged: `pipeline-start-v3` 8/8, `bootstrap-payload-measure` 5/5, `pipeline-start-preflight-enforcement` 19 pass 0 fail (20 counted), `hook-refresh-detection` 41/41, `ready-preflight-prints-a-compact-envelope` 3/3, `bootstrap-source-attestation-acceptance` 15/15.

Also run green: `start-skill-fits-the-reattach-window` 3/3, `setup-check` 1/1 (the two reads of `plugin-refresh-required` outside the preflight). `pipeline-start-v3` and `bootstrap-payload-measure` were run in parallel once by mistake (both green; the rule was one at a time). Guard admission was read, not run: `lib/guard/command-catalogue.mjs` admits `refresh-mandatory-hooks.mjs` as exactly `--root <root>` for the loaded plugin's script by identity, independent of the preflight status, so the soft-state action is admitted the same way as the `hook-refresh-required` one. The doc paragraph "Advisory and restart" in `onboarding-recovery.md` and the planner's comment were aligned with the new case. `apply --check` against the real HEAD was run: exit 1 (expected, the integrated 30j tree is not applied); against the integrated 30j tree: exit 0.

## Not changed

- No protected hook installer, no guard catalogue, no `refresh-mandatory-hooks.mjs`, no `hook-currentness.mjs`; the refusal text of the guard stays.
- The preflight stays read-only: "once" comes from the typed action and its readback, not a stored marker.
- Precedence when the soft status ALSO has an unready project onboarding: the refresh action takes the `nextAction` slot, as it already does on the `ready` path; the onboarding action returns on the rerun. Not covered by a dedicated case.

## Not proven

- No live `/reload-plugins`, no live soft status on a real registry; the soft state is built from the injected registry readback.
- The other half of the J8 "Not measured": which tree the guard refusal's PRINTED command rebinds to in the soft state. It is the same script by the same catalogue rule, but no test drove the refusal text here.
- Integrator step, not run: if the documentation inventory records digests of `SKILL.md` or `references/onboarding-recovery.md`, a rebaseline (`scripts/rebaseline-inventory.mjs`) belongs to the integrated 30j tree, not to this patch.
- The divergent topology named in the J8 notes (hook's recorded source differs from the loaded directory) is unchanged.
- No Full Verify, no architecture-boundary run, no Critic. The new test files are existing registered files; no registration needed.
