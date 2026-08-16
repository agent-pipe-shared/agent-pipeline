---
schema: pipeline.backlog-item.v1
id: pipeline.gitignore-evidence-rule-swallows-durable-spec-artifacts
type: defect
owner: pipeline
status: open
created: 2026-08-16
source: "Found 2026-08-16 when two dispatches in one session correctly refused to force-add their dispatch records, and the Critic separately flagged that the evidence artifact it was given sat under scratch/ rather than the calibration's canonical evidence/ location. Verified with git check-ignore before filing."
due: 2026-09-15
---

# `.gitignore`'s `evidence/` rule is unanchored, so it also swallows the Spec packages' durable audit artifacts

## Description

`.gitignore:25` is `evidence/`, unanchored. Its own comment (`:22-24`) says what
it is for: "Machine-generated verify evidence (QG-03, AC-G4-2): regenerated every
`node harness/scripts/verify.mjs` run — a status snapshot, not a durable audit
trail". That describes the repository-root `evidence/` directory, which holds
`verify-latest.json` and `security-latest.json`.

Because the pattern has no leading slash, git applies it at **every depth**. It
therefore also matches `specs/<package>/evidence/`, which holds the opposite kind
of artifact: durable, per-package audit records — Critic reports, dispatch
records, findings registries, acceptance evidence maps — that ADR-0045's canonical
artifact topology expects to be tracked.

Confirmed, not inferred:

```
git check-ignore -v specs/sprint-phoenix-epic/evidence/pac11-critic-review-8be6c308.md
.gitignore:25:evidence/   specs/sprint-phoenix-epic/evidence/pac11-critic-review-8be6c308.md
```

The files of that kind already in history got there by being force-added past this
rule, one at a time. Nothing records that this is required, so a dispatch that
follows the stated policy silently loses its record instead.

## Triggering situation

Two dispatches on 2026-08-16, independently:

- `PHX-VF-INVENTORY` was briefed to write a dispatch record to
  `specs/sprint-phoenix-epic/evidence/`. It found the ignore rule, judged that
  force-adding against a documented repository policy was not its call, and
  reported the conflict instead of resolving it unilaterally. That was the right
  judgement, and the consequence is that the record exists only on disk.
- `PHX-WP-PAC11` hit the same wall and was briefed not to attempt a record at all.

The Critic then flagged the downstream effect from the other side: the evidence
artifact it was handed sat under `scratch/`, "outside the calibration's canonical
`evidence/` location" — non-blocking on its own, but it is what made a separate,
more serious QG-03 substitution visible.

## Affected artifact

`.gitignore:25`; every `specs/<package>/evidence/` directory.

## Proposal

Anchor the rule to the repository root — `/evidence/` instead of `evidence/` —
which is exactly what the existing comment already claims it means. Verified in a
working copy before filing: `evidence/verify-latest.json` stays ignored, and the
Spec package's durable artifacts become visible.

**This is deliberately not a one-line fix, and the reason is measured rather than
assumed.** Anchoring the rule surfaces roughly 75 previously-invisible untracked
files under `specs/sprint-phoenix-epic/evidence/` alone. Left untracked they make
the working tree dirty, and both `harness/scripts/verify.mjs`'s candidate
preflight and `security-scan.mjs` refuse a dirty tree — so the naive fix breaks
the verify gate the moment it lands. The change therefore has to be made together
with a curation pass that decides, per file, tracked or ignored:

- genuinely durable and belongs in history: Critic reports, dispatch records,
  findings registries, acceptance evidence maps, design diffs;
- genuinely a regenerated snapshot and should stay ignored: the per-run
  `*-verify-*.json` observations, which are the same category as the root
  directory's own contents and may need their own narrower pattern;
- and every file added must first be checked for machine-specific absolute paths,
  which `guardrails/git.md` and this repository's hard rules forbid in history —
  a bulk add would be exactly the wrong way to do this.

Do it as one briefed dispatch with the curation list fixed up front, not as an
opportunistic edit inside another work package.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
