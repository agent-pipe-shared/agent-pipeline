# ADR-0093: A Semgrep finding blocks only when the feature introduced it

> Agent-Pipeline · Sprint Alfred · 2026-11-12

**Status:** accepted (2026-11-12, PO tile, register D242). Built in candidate 28e. Not yet run on a real consumer repository.

**Context source (PO tile, 2026-11-12):** for the Semgrep rule pack the PO chose the recommended option: block only findings that are new in the feature (Semgrep's `--baseline-commit` against the feature's start); findings that existed before are listed and do not block.

## Context

The security scan of a feature close runs every scanner over the whole candidate tree, and any finding at a blocking severity (`security.thresholds.block_on`, default critical and high) blocks. A team that adopts the Pipeline on an existing Java or .NET repository, and a stronger Semgrep pack (candidate 28e), would get every string-built query of the last ten years as a blocking finding at its first close, unrelated to the feature. The tile limits the block to what the feature introduced, without hiding the rest.

Measured with Semgrep 1.170.0 OSS on throwaway repositories before building (Linux, WSL2, 2026-11-12):

- With `--baseline-commit` Semgrep reports only the new findings; the older ones are absent from its output, not marked. It matches by code, not by line, so code that only moved is not new.
- Both of its passes cover only the files changed since the base (10.0 s full scan against 3.1 s with the base, 200 files with 20 changed).
- It checks the base commit out in the tree it scans; killed during that pass, the tree is left on the base commit.
- A base commit that does not exist ends the run with exit 2 (a scanner error under the adapter's fail-closed rule).
- The rule id is derived from the rule file's path relative to the working directory, so a rule file inside the scanned tree gets a different id in another worktree.
- The OSS JSON has no usable fingerprint (`"requires login"`).

## Decision

1. **The full scan stays as it is.** Every finding stays in the evidence and in the printed summary.
2. **A second pass decides what is new, only when needed.** When the full Semgrep scan has a finding at a blocking severity, `security-scan.mjs` runs Semgrep again with `--baseline-commit <feature start>`, in a second throwaway detached worktree of the same candidate (never in the shared scan snapshot), and removes that worktree afterwards whatever happened. A project `rules_dir` is read from that worktree's own copy so the rule ids line up.
3. **The baseline is never a caller's input.** `lib/semgrep-baseline.mjs` reads it from the candidate snapshot: the State file's active feature, else its last closed feature; the start of that feature's range by the one definition the close already uses for its commit count (`featureRangeBase` in `lib/close-commit-split.mjs`: the parent of the first first-parent commit that touched `specs/<feature>/`); the base must be a commit and an ancestor of the candidate.
4. **Existing means: reported by the full scan, not reported as new by the baseline pass.** Matched by rule, path relative to each worktree, and line. The judgement is recorded in the evidence under `execution.semgrepBaseline` (feature, base commit, the existing findings, the new count); the finding envelope and the v1 key set are unchanged.
5. **One verdict function.** `blockingFindings` in `lib/semgrep-baseline.mjs` decides the scan's exit code: a finding blocks when its severity is in `block_on`, except a Semgrep finding the applied baseline names as existing. Every gate that reads the security evidence's `exitCode` (close, push, publication, release) inherits it; the v2 evaluator never re-derived blocking from severities.
6. **Fail closed, labelled.** The baseline is `unavailable`, and every blocking-severity finding blocks as before, when the State names no feature, the range or base cannot be read, the base is not an ancestor, the worktree cannot be created, the pass fails or times out, a finding of the pass has no counterpart in the full scan, the added files cannot be listed, or a finding judged existing sits in a file the feature added. The summary prints why.
7. **Older findings are visible.** The summary lists them (up to 20, then a count pointing at the evidence) and says they do not block.

## Consequences

A team can adopt the Pipeline on an existing codebase without a first close that fails on old findings, and every finding the feature adds still blocks. Because the baseline comes from the last closed feature after a close, the push of a closed candidate judges the same way the close did; code committed after that feature's start, inside or outside a feature, counts as new.

Known limits:

- A finding whose cause spans a changed and an unchanged file is judged only in the changed files (Semgrep limits both passes to them).
- Only Semgrep has a baseline. gitleaks, osv-scanner and the license check still block on every finding; a secret found by the default pack's two Semgrep ERROR rules (PEM private key, provider-shaped secret) that predates the feature no longer blocks through Semgrep, and gitleaks still blocks it.
- A blocking close costs a second, shorter Semgrep run.
- The feature start is read from history: a commit that touched `specs/<feature>/` before the code it carries makes that code part of the baseline. History is not rewritten under the Pipeline's guards, and the range is the one the close already prints.
- Not run on native Windows.

## Affected contracts

ADR-0091 (the close's SBOM) and the close-commit split share the feature-range definition. The Semgrep rule pack of candidate 28e, which makes the severe classes blocking, is a separate decision.
