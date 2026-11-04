# w164 — the feature package registration reports whether the push threat model exists (candidate 19, D4a)

Delta on w163. Elephant-built, in a clone that carries the whole chain. D4a (Antigravity greenfield finding): a push threat model first created at the Close moves the candidate after the Critic and Verify already ran and forces a second round for no product change. w145 added the guidance (happy path step 6); nothing told the agent, at the moment it mattered, whether the file already existed.

## What it changes

- `scripts/register-feature-package.mjs`: the result of a registration (`registered` and `already-registered`) carries `pushThreatModel`, from the new exported `pushThreatModelReadback(root)`: `{ path, present: true }` when `project/push-threat-model.md` exists; otherwise `{ path, present: false, materializeCommand, commitWith, why }`, naming `pipeline-state.mjs materialize-push-threat-model` and that the file belongs in the same draft commit, before the item binding is generated. Advice only: it writes nothing and refuses nothing; every non-checkpoint push demands the file anyway (push-prepare's `push-threat-model` check), so the readback is unconditional.
- `skills/pipeline-start/references/happy-path.md`: step 6 names the new field.
- `scripts/register-feature-package-readback.test.mjs` (new, RFPR1 to RFPR3), registered in `harness/verify-suites.json` and `docs/product-capability-inventory.json`.

## Checks

- Clone: the new suite and `happy-path-guide-names-only-existing-scripts` and `check-consumer-safe-paths` 14/14; the pins that run the registration end to end (`consumer-approved-plan-reaches-the-first-item-host-commit`, `critic-course-consumer-chain-walk`, `catalogue-admit-prescribed-lifecycle-verbs`, `repair-map`) 67/67 together with the new suite. Registration checker: 1162 registered, 0 unregistered; case-completion checker valid (389). `git apply --check` against the chain clone: exit 0.

## Not changed / not proven

- No enforcement: nothing refuses a registration or the set-phase step while the file is missing, and there is no design-phase readback before the registration (the registration is the first command the draft commit runs). The pre-push gate stays the only enforcement.
- The `commitPaths` list does not include the file (it does not exist yet at that moment); the agent adds it after running the command.
- No Full Verify; no independent Critic review (suspended by the PO).
