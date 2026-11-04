# w145 — the happy path materializes the push threat model with the draft commit (candidate 19, D4a, Antigravity greenfield)

Applies on top of the chain at 108a1d72d. Elephant-built small item (PO exception for small items), built in a clone.

## What it changes

- `plugins/pipeline-core/skills/pipeline-start/references/happy-path.md`, Design step 6: when the push gate is configured `approval: required`, the agent also runs `pipeline-state.mjs materialize-push-threat-model` (no flags; it refuses when the file exists) and commits `project/push-threat-model.md` with the draft commit. Reason given in the text: a threat model first created at the Close moves the candidate after the Critic and Verify already ran.

## Checks

- Run alone in the clone: `happy-path-guide-names-only-existing-scripts.test.mjs` 2/2 (the named script exists), `runner-capabilities.test.mjs` 5/5.
- The command has no phase precondition (read in `pipeline-state.mjs`, case `materialize-push-threat-model`): it only refuses when the file exists or the shipped template is unreadable, so running it in the design phase is possible today.

## Not changed / not proven

- No code enforces the order: the close guide (`close-chain-guide.mjs`) keeps listing the step before the freeze as a fallback for a project that did not do it earlier. A design-phase readback that names the step is not built.
- D4b (candidate equality over the product subtree) is the ADR-bound part and stays open.
- No full Verify run; no independent Critic review (suspended by the PO).
