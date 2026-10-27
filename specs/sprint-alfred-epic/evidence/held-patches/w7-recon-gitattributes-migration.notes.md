# W7 recon D47: onboarding .gitattributes write and migration (notes only, PARTIAL)

Read-only recon, no patch, no onboarding or migration step run. Budget ended at call 28 of 35 (7 calls lost to guard-grammar refusals of
`cd &&`, `--glob`, `-A`); questions 3 and 4 are therefore only partly answered. All line references are at candidate d3f0e65890.

## 1. Which onboarding step writes project files, and where a .gitattributes block would go

- Writer: `lib/project-onboarding-v3.mjs`. Plan: `planProjectOnboardingV3` (line 5700). Apply: `applyProjectOnboardingV3` (line 6145), which
  writes every target with `fs.writeFileSync(path, target.bytes, { flag: "wx" })` (line 6179), i.e. create-only, and rolls back on failure.
- The plan builds the target list `internal` at lines 5722-5738 and maps it to plan `targets` with a `kind` (lines 5739-5751). The
  `.gitignore` seed is the only existing "project-owned" file target: `...(seedsProjectIgnore ? [{ path: ".gitignore", bytes: PROJECT_IGNORE_SEED }] : [])`
  (line 5732), `seedsProjectIgnore = !(inspected.entries ?? []).includes(".gitignore")` (line 5714), `kind: "project-ignore"` (line 5744-5745).
  A `.gitattributes` seed would be a sibling entry on line 5732 with its own constant next to `PROJECT_IGNORE_SEED` (lines 212-246) and a new
  `kind` (for example `project-attributes`) at line 5742-5747.
- Convention: there is NO idempotent managed block for `.gitignore`. The convention is (a) seed only when the file is absent, (b) never touch
  an owned file, (c) content-based gap check plus an ASK. `missingProjectIgnorePatterns` (5795) compares exact trimmed lines against
  `REQUIRED_PROJECT_IGNORE_PATTERNS` (252, derived from the seed), `readProjectIgnoreText` (5806), `collectProjectIgnoreGapAction` (5829,
  `mutation: false`, guidance tells the agent to append the lines with ordinary tools, "onboarding will never write to a file the project
  owns"), attached at apply time (6267-6272) and on re-probe by `withPendingProjectIgnoreGapAsk` (7221), composed in
  `withAllPendingOnboardingAsksAttached` (7239). A `.gitattributes` analogue should copy this exact shape (seed when absent, ask when present
  without the lines) rather than invent a managed block. A managed block would be a NEW convention and a po-decision.
- Note for the lines: the seed ignores `/evidence/` (line 222) but not `specs/*/evidence/`, so root `evidence/` is untracked in a consumer and
  only `specs/<feature>/evidence/` is committed evidence.

## 2. Evidence paths in use

- `lib/critic-diagnostic-evidence.mjs` line 28 `diagnosticEvidenceLocation(path)` and line 37 (`CDI-OUTPUT-PATH`): diagnostic evidence is written
  "under evidence/ or specs/<feature-id>/evidence/". The producer (`lib/critic-diagnostic-producer.mjs`) names no path itself (rg for
  `specs/` returned nothing; paths come from the `--log`/`--out` flags and `captureEvidence`).
- The registrar `lib/feature-package-registration.mjs` `addCriticDiagnosticEvidence` (line 402): `evidenceDir = specs/${featureId}/evidence/`
  (line 408); `pathProblem` (line 423) requires the file under that directory. Manifest `specs/<feature>/lifecycle.json`, and
  `specs/<feature>/design/critic-review-unit.json` (118) are not evidence digests of this class.
- Exact attribute lines (proposal, not yet run against a fixture): `specs/*/evidence/** -text` or `specs/*/evidence/** text eol=lf`, plus
  `evidence/** -text` / `eol=lf` for the root directory. `-text` is the safer pin for digest-bound bytes (no conversion either way, also for
  `.log` and `.json`); `eol=lf` converts on checkout/commit and depends on the file being LF in the blob. Which of the two is a po-decision
  (the D47 decision said "eol=lf or -text"). Pattern check not done: gitattributes `**` and a single `*` in the middle segment should be
  verified with `git check-attr` in a clone before the slice fixes the strings.

## 3. Existing migration or repair surface (PARTIAL)

- `MIGRATION_SCRIPT` = `scripts/runner-profile-migration-v3.mjs` (constant at project-onboarding-v3.mjs line 256; catalogue route
  `lib/guard/command-catalogue.mjs` line 413 `sanctionedMigrationArgs`, defined `lib/guard/sanctioned-args-scripts.mjs` line 194). Verbs
  `inspect|plan|apply [--initialize-missing-runtime] [--activate]` (script lines 22-43). It migrates the RUNNER PROFILE / manifest of an already
  onboarded repository (`lib/runner-profile-migration-v3.mjs` `inspect` 570, `plan` 667, `apply` 1261). It is plan/digest-bound, so it is the
  closest model for a plan-disclosed, digest-bound step, but it is runner-profile specific; adding attributes there would widen its meaning.
- Other candidates seen in the import list, NOT read: `PROJECT_AUTHORITY_MIGRATION_SCRIPT`, `PO_PROFILE_REPAIR_SCRIPT`, `REFRESH_MANDATORY_HOOKS_SCRIPT`,
  `applyProjectOnboardingManifestRepair` (project-onboarding-v3.mjs 4152) and `...ManifestRepairV4` (4709).
- Cheapest honest detection: reuse the content-based gap check shape (item 1): read `.gitattributes` text, report the exact required lines
  missing. That already gives a readback at every portable apply and every lifecycle re-probe for free, with no new verb. Adding the lines for an
  EXISTING repository follows the existing restraint (ask, agent appends with ordinary tools) unless the PO decides a plan-disclosed writer is wanted;
  that writer would be a new small script plus a catalogue route (a guard-surface change, native-host-only to land).

## 4. How onboarding file writes are tested (PARTIAL)

Candidate files by name only (not opened): `lib/project-onboarding-v3.test.mjs` (main), `lib/project-onboarding-v3.flap.test.mjs`,
`lib/project-onboarding-ready-gate.test.mjs`, `lib/onboarding-greenfield-walk.test.mjs`, `lib/project-onboarding-foreign-residue.test.mjs`,
`lib/pins/greenfield-scaffold-on-a-non-empty-new-project-root.test.mjs`. `.gitignore` seed and gap-ask cases live in the first (grep for
`project-ignore`/`projectIgnoreGapAction` to find the fixture style; not done). The only `.gitattributes` fixture style seen is
`lib/bound-design-line-endings.test.mjs` line 28 (`writeFileSync(join(root,".gitattributes"), ...)` in a temp git repo).

## Gap list

| # | Gap | Tag |
|---|---|---|
| G1 | Onboarding seeds no `.gitattributes` (line 5732 has only `.gitignore`) | code-fixable-here |
| G2 | Existing repo without the lines gets no signal; needs a gap check + ask like `.gitignore` | code-fixable-here |
| G3 | `-text` versus `eol=lf` and the managed-block versus ask convention | po-decision |
| G4 | A plan-disclosed, digest-bound writer for an existing repository (new script plus guard catalogue route) | po-decision, then native-host-only (guard surface) |
| G5 | Real `core.autocrlf=true` Windows checkout confirmation | native-host-only |

## Minimal slices (proposed)

1. Onboarding seed + gap ask. Files: `lib/project-onboarding-v3.mjs`, `lib/project-onboarding-v3.test.mjs`. RED: fresh plan lists a
   `.gitattributes` target whose bytes contain the evidence lines; a root that owns a `.gitattributes` without them gets no such target and a
   `projectAttributesGapAction` with `mutation:false`; one with them gets none. Subject:
   `feat(onboarding): seed evidence line-ending attributes and ask for them in an owned .gitattributes (D47)`.
2. Migration for an existing repo (only if G3/G4 decided for a writer). Files: a new script under `scripts/`, its lib, catalogue route, tests. RED:
   `inspect` reports missing lines; `plan` is digest-bound; `apply` appends once and a second apply is a no-op. Subject:
   `feat(onboarding): add a plan-disclosed attributes migration for existing repositories (D47)`.

## Confidence

Medium for questions 1 and 2 (code read at the cited lines). Low for 3 and 4 (partial, files not opened). No contradiction with the second-pass
recon note was found; its claim that onboarding writes no `.gitattributes` matches line 5732.

CONTINUATION CARD -- done: Q1, Q2, gap list; remaining: read sanctioned-args-scripts.mjs:194, the other repair scripts, and the `.gitignore`
cases in project-onboarding-v3.test.mjs; `git check-attr` check of the pattern strings in a clone; next step: a follow-up dispatch with a
budget that avoids `cd &&` and `-A`/`--glob` flags.
