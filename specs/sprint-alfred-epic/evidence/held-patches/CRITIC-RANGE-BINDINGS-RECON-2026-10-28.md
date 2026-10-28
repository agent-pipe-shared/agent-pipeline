# Critic range with state/handover files or a retained prior result: recon and slice definition (2026-10-28)

Backlog item: `backlog/items/2026-10-28-critic-range-with-state-or-handover-files-has-no-admissible-briefing.md` (read it first). PO decision 2026-10-28: one
narrow new role `project-state record`, a command that derives the bindings, a preflight refusal, an operator note. This note is model output: re-verify every
cited line before relying on it.

## What the canon says today (verified)

- `templates/prompts/critic-review.md` (a byte-identical copy lives at `plugins/pipeline-core/templates/prompts/critic-review.md`; keep both in step):
  line ~139 (the range contains retained prior results: prepare the partition under `harness/review-protocol.md` §2.2), lines ~234 to ~268 (the Diff and
  `Correction input bindings` fields: each exclusion names path, role (retained prior result or finding-disposition record), and every touched version's blob
  identity, SHA-256 and mode, with explicit absence at addition/deletion boundaries; no body, finding, verdict label or summary; unknown roles stop the
  review), lines ~215 to ~228 (forbidden material includes handover and state).
- `harness/review-protocol.md` §2.2, the paragraph `Correction ranges containing retained prior results` (lines ~77 to ~117), and `roles/critic.md` line ~40
  (forbidden material: handover, state, history, ...).
- No script or library derives the bindings (searched `plugins/`, `scripts/`, `harness/scripts/`). The template fixes no schema for the bindings file; the only
  mention in code is a template-text pin in `plugins/pipeline-core/lib/pins/opus-critic-only-batched-for-architecture-and-security.test.mjs`.
- The project calibration `project/pipeline.json` names the handover file in its `handover` field (this repository: `docs/state.md`).
- Critic results are written under an `evidence/critic/` location by `plugins/pipeline-core/scripts/session-critic-finalizer.mjs` and
  `plugins/pipeline-core/lib/critic-review-lineage.mjs` (find the exact path construction there; do not guess the layout).
- `harness/verify-suites.json` is a protected path (TP-13): do NOT create a new test file; add cases to an existing, already registered test file.

## The design (smallest honest change)

Bindings document, schema `pipeline.critic-correction-input-bindings.v1`, written as canonical JSON, no body, finding, verdict label or summary anywhere:

- `base` and `head`: commit id and tree id each.
- `commits`: every commit of `base..head` in order, each with `commit`, `parents[]`, `tree`.
- `exclusions`: sorted by path; each `{ path, role, versions: [{ commit, change, blobBefore, blobAfter, sha256After, modeBefore, modeAfter }] }`
  where `role` is one of `retained prior result`, `project-state record`; an absent side is the literal string `absent`; `sha256After` is the SHA-256 of the
  blob bytes, computed from the git object and never printed as content.
- `sourcePaths`: sorted exact literal paths of everything else the range changed, including both paths of a rename and mode-only changes.
- `digestSha256`: SHA-256 of the canonical JSON of the document without this field.

Classification, closed and mechanical, nothing free:

1. `project-state record`: the calibration `handover` path, and a file named `pipeline-handover*.md` in the same directory as that path. Nothing else.
2. `retained prior result`: a file under the repository's Critic results location (the `evidence/critic/` layout the finalizer writes, including the
   per-feature `specs/<feature>/evidence/critic/` form). Each file is listed by its exact path, never the directory.
3. Everything else is `source`. A rename or copy whose two paths fall into different classes, and a path of class 1 or 2 that also appears in a commit that
   changes a `source` path of the same file, are refused with a typed error (mixed). An unreadable calibration is refused, never defaulted.

Command: `plugins/pipeline-core/scripts/critic-correction-input-bindings.mjs derive --root <root> --base <commit> --head <commit> --out <path under scratch/>`
with a library `plugins/pipeline-core/lib/critic-correction-input-bindings.mjs`. Metadata-only git observations only (`rev-list --parents`, `diff-tree
--raw -r -z -M --no-textconv --no-ext-diff`, `cat-file`), never a patch-producing command on an excluded path. Prints a one-line JSON result with schema,
`digestSha256`, counts per role and the written path; exit 0 on success, exit 2 with a typed code on refusal.

## Slices

- C1 (this recon's first dispatch): library, script, and cases added to an existing registered test file (no new test file). Cases: a range with only source;
  a retained prior result; the state file changed in several commits; a rename across classes (refused); a deleted state file (absence recorded); the
  output carries no content byte of an excluded file (use a distinctive marker string in the fixture file and assert the document does not contain it);
  determinism (same range, same digest); unreadable calibration refused.
- C2: canon text. Both template copies, `harness/review-protocol.md` §2.2, `roles/critic.md`, the Critic skill note and an ADR-0014 amendment name the new
  role and the command; the template pin test follows.
- C3: `critic-dispatch-preflight.mjs` refuses a range that contains such paths when no bindings reference is given (separate recon).
