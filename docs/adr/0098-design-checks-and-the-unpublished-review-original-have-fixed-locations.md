# ADR-0098: Design checks and the unpublished review original have fixed locations

> Agent-Pipeline · Sprint Alfred · 2026-11-14

**Status:** accepted (2026-11-13, PO tile "G3/G4: fixed locations", register D250). Built in candidate 29d. Not yet run on a real consumer repository.

**Context source (PO tile, 2026-11-13, consumer findings G3 and G4):** the PO chose the recommended "fixed locations":

- project check scripts are committed under one fixed folder (`tools/checks/`) and run in draft;
- the unpublished original of a sanitized design review report lives under the git-ignored `evidence/` folder.

## Context

The design course asks the author to run deterministic checks (paths, hashes, references) before binding the final source hashes. In a consumer project those checks are small project scripts. In design draft the dev-plan gate treats `node <script>` as an opaque script run, because a script can write implementation files. Every project check was therefore refused in the phase that asks for it (G3).

A sanitized design review report (D64) is published, and its unpublished original is bound by digest only. The receipt producer refused the original under `scratch/`. Under `specs/` or `docs/` the commit guard would put it into a commit (G4).

## Decision

1. **Project checks: `tools/checks/`.** `node tools/checks/<name>.mjs|.cjs|.js [args]` is not an opaque script run in any lifecycle state when all of these hold:
   - the file sits directly in `tools/checks/`;
   - no part of the path is a symbolic link;
   - git tracks the file;
   - it is unchanged against HEAD (`git diff --quiet HEAD`).

   Anything else stays what it was: an edited, untracked, linked or misplaced script, a script under `scratch/` with arguments, and every other interpreter. The folder is fixed, not calibrated, so no calibration field changes.
2. **Why this is safe in draft.** In draft the dev-plan gate refuses the agent's own edit under `tools/checks/`, because only `docs/`, `specs/`, `.claude/`, `backlog/` and `scratch/` are exempt. A check script therefore comes from an implementation phase or from a human, and is reviewed project content. A committed script may still write files. The rule trusts the review of committed content, not the script's behaviour.
3. **Review original: `evidence/`.** `design-review-receipt.mjs create --original-report evidence/<name>.md` is the documented place. Onboarding git-ignores `/evidence/`, so the file stays local and is never committed, while `create` binds its digest. The guard and the producer already admitted this path. `scratch/` stays refused for it.

## Consequences

- The design-course reference names both places.
- The `PLAN-DESIGN-REVIEW-UNOBSERVED` repair names `evidence/` for the original.
- A project that wants a check to run in draft commits it under `tools/checks/` during an implementation phase, or has a human add it.
- The pins `C29-G3` (`hooks/guard-lifecycle-ready.test.mjs`) and "design-review receipt (original under evidence/)" (`lib/pins/lifecycle-coordination-commands-refused-as-implementation-writes.test.mjs`) hold both rules.
- Not covered: a check script that imports an uncommitted or edited module elsewhere in the tree. Only the named file is checked against HEAD.
