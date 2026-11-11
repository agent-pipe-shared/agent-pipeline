fix(critic): name a damaged course history and the one way on

- A Critic course whose history holds a manifest revision that lists
  evidence its own commit lacks refused every read with a bare
  CCA-EVIDENCE-MODE / CCA-EVIDENCE-READ. The Codex greenfield run stopped
  and could only call it "an older evidence error".
- locateCourseEvidenceGap (read only) finds the first such revision and
  path. The Critic preflight repair, register-feature-package's delta route
  (now FPR-DELTA-COURSE-GAP with gapCommit and gapPath) and
  inspect-course-takeover name the commit and the path and route to a new
  feature of rigor 1. History is not rewritten and the reader stays strict
  (PO decision 2026-11-10).
- Checked read-only against the real damaged repository: the text names the
  exact commit and file.

AI-Assisted: true
Dispatch: stage-0 (elephant)
