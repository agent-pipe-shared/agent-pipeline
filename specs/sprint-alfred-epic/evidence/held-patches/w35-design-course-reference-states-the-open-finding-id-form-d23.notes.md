# Held patch notes — the design course reference states the `--open-finding` id form (Toolbox D23 documentation half, candidate 15c)

Patch: `w35-design-course-reference-states-the-open-finding-id-form-d23.patch`. Documentation only, one file (`skills/pipeline-start/references/design-course.md`), applies on the bare tree. It completes the documentation half of D23 that `w32` left open: `w32` makes the refusal name the bad id; this states the form where the command is described. The sentence mentions that the refusal names the id, so apply it after `w32` (the script does).

## What

In the description of `design-review-receipt.mjs create`: an `--open-finding` id is upper-case letters and digits starting with a letter, in 2 to 8 hyphen-joined parts such as `AC-155` or `DESIGN-REVIEW-3`; `F1` is refused as `DRR-FINDING-IDS`. The form is the one the library enforces (`FINDING_ID`, at most 80 characters, at most 64 ids); the document does not restate the bounds.

## Evidence

- Doc-contract and case-completion suites 108/108.

## Not covered

- No test pins the sentence against the library pattern; the form is stated in prose only.
