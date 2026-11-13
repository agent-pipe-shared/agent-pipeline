# ADR-0096: A gate-definition change needs a bound proof, at commit and at close

> Agent-Pipeline · Sprint Alfred · 2026-11-13

**Status:** accepted (2026-11-13, PO tiles, register D248). Built in candidate 29c. Not yet run on a real consumer repository.

**Context source (PO tiles, 2026-11-13, Claude test run 3 finding L4):** the PO chose:

- "Only first creation free (recommended)" for `architecture/boundary-policy.json`;
- "Counts, labelled (recommended)" for `configure-verify` as proof;
- "Refuse everywhere" for features already in flight at install (against the report-only recommendation);
- "At commit and at close (recommended)" for where the rule is enforced.

## Context

In the third Claude test run the Elephant changed gate-definition files in stage-0 commits. One of them had no proof at all. The Critic and the PO could not see that a gate had been weakened. A gate-definition file decides how strong a gate is: the verify command, the calibration, the boundary policy, the fitness model, the manifest gates, the guard configuration, the push-approval mode, the trust anchors.

The commit-time backstop already exists for every entry of `GATE_STRENGTH_PATHS` (the pre-commit hook). It refuses a staged protected path unless one closed union admits it:

- a signed quality package;
- the closed-continuity binding;
- a writer-commit capability armed by a sanctioned writer;
- the configure-verify transition;
- a maintenance window;
- a consumed human-guard-override capability;
- the first appearance of the path in history;
- the trust-anchor bootstrap upgrade.

That backstop has three gaps:

1. **Two files are missing from the table.** `architecture/boundary-policy.json` and `architecture/fitness-model.json` are not in `GATE_STRENGTH_PATHS`, so an agent edits them freely.
2. **The close never asks.** It does not check whether a gate-definition change in the feature range carried a proof.
3. **Commit-time evidence stays on the device.** A record the hook leaves is private to that machine. A commit that bypassed the hook leaves none: `--no-verify`, a hook not yet installed, or the PO's own held-patch apply script, which commits with `--no-verify`.

## Decision

1. **Two more gate-strength paths.** `GATE_STRENGTH_PATHS` gains:
   - `GS-16 architecture/boundary-policy.json`;
   - `GS-17 architecture/fitness-model.json`.

   The Write/Edit guard, the shell lane and the pre-commit hook all follow the table, so the commit side needs no new code path.
   - The first creation stays free by the existing first-appearance rule. "First appearance" means that no ancestor commit names the path, deletions included. Deleting the file and creating it again is therefore not a first appearance, and staging the deletion itself needs proof.
   - The sole writer of the fitness model, `pipeline-state.mjs materialize-architecture`, arms a writer-commit capability for exactly the bytes it wrote. A closed writer-to-path map admits `GS-17` for that writer and no other gate-strength path. The PO-approved design is its authority.
2. **The gate-definition set.** The close checks a subset of the gate-strength table, called the gate-definition set:
   - `GS-1` `pipeline.user.yaml`;
   - `GS-2` the trust anchors;
   - `GS-3`/`GS-5` the manifest;
   - `GS-4`/`GS-7` the guard configuration;
   - `GS-10`/`GS-11`/`GS-12` the calibration;
   - `GS-13`/`GS-14` the policy lock;
   - `GS-16`, `GS-17`.

   Plugin source (`GS-8`/`GS-9`) and onboarding staging (`GS-15`) have their own routes and are not part of it.
3. **The close walks every gate-definition change of the feature range.** It looks at every non-merge commit in the range, not only stage-0 commits, that adds, modifies or deletes a path of the set. For each change (commit, path, blob) it derives a proof, durable evidence first:
   - **first appearance:** no ancestor of the commit names the path;
   - **materialization:** for `GS-17`, the committed `architecture/design-materialization.json` in that commit's tree names the path with the blob's sha256;
   - **configure-verify:** for `GS-10`/`GS-11`, the private configure-verify transition record of that commit. It is labelled "confirmed via runner prompt, not signed", as the PO chose;
   - **human-guard override:** a consumed capability for the path, re-verified against its MAC and its candidate binding, never trusted by a kind string;
   - **acknowledgement:** the PO's signed acknowledgement of the range (Decision 4).

   A change with none of these is unproven. The close refuses while any change is unproven (`CLOSE-GATE-CHANGE-UNPROVEN`), with no cut-off for features already in flight at install.
4. **The repair is one signed acknowledgement per feature range.** History cannot be rewritten, and a revert leaves the old commit in the walk. The only exit is the PO's acknowledgement, after the fact, of exactly the unproven list.
   - It is a critical-action kind (`acknowledge-gate-definition-changes`) in the `gates.human_approval` mode, fail-closed to `signature`, through the same ceremony as the acknowledgement of a caller-authored Critic.
   - The agent runs `pipeline-state.mjs approve-gate-change-acknowledgement --by <label>`. `--by` is only a label the PO gave for this command (EL-36).
   - The subject binds the feature, the candidate commit and the sorted list of (commit, path, change, blob sha256).
   - A later unproven change is not covered and needs a new acknowledgement.
   - The record is labelled "acknowledged after the fact".

   This route also covers device-local records that are missing on the other machine and commits that bypassed the hook.
5. **Seen early, not only at the close.** `pipeline-state.mjs inspect` and the pre-close readback list the unproven changes with the exact repair command, before the close refuses.
6. **The Critic and the bundle see every gate change.** The audit bundle and the Critic input carry the derived list: each change with its proof kind and reference, and its label where it is not a signature. The acknowledgement's public proof object travels like the other critical proofs.

## Consequences

A gate weakening can no longer pass silently. The commit side refuses it unless something admits it, and the close lists it with its proof or refuses it.

The price:

- A feature in flight at install, including one of this repository, may need one PO acknowledgement before it can close.
- Commits applied with the PO's held-patch script carry no commit-time record. They need that acknowledgement when they touch a gate-definition file.

Known limits:

- The configure-verify transition and the human-guard-override capability are private to the device that recorded them. A close on the other machine does not find them and falls back to the acknowledgement.
- Merge commits are not walked; the change commits they bring in are.
- The acknowledgement proves that the PO saw the list, not that each change is sound. The Critic still reviews the content.
- Under `chat` the acknowledgement is an attributed record, not a proof, as for the other critical kinds in that mode.
- Not run on native Windows.

## Affected contracts

- ADR-0059 (signed human-guard override: a consumed capability counts as proof);
- ADR-0061 / ADR-0074 (the critical ceremony and its new kind);
- ADR-0085 (the fitness model is materialized from the approved design);
- ADR-0014 (the Critic input carries the gate changes);
- ADR-0091 / ADR-0090 (the close and its audit bundle).
