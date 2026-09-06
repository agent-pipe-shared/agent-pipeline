# Neutral findings registry — NVA-B-CODEXGUARDIMPORT-1

Source: T1 Critic review (opus, max; functional-equivalent-read-only), round
1, of commit `d398a66212278cc6052c1b1fa467d085ffa1c6e7`.

**Verdict: FAIL.**

- **F1** (major — lifecycle violation, disclosed): the commit was authored
  directly by the Elephant session, not dispatched. EL-01's stage-0
  fast-path exception does not cover a guardrail-hook-CI file regardless of
  diff size. Self-disclosed before the review
  (`backlog/evidence/2026-09-06-nva-b-codexguardimport-1-authorship-disclosure.md`);
  the Critic confirmed the disclosure accurate and not the basis for the
  verdict.
- **F2** (major — evidence gap): no completed verify result bound to the
  reviewed commit existed in the evidence set or in the repository's own
  gate artifact at review time.
- **F3** (minor — evidence gap): the mandated `check-consumer-safe-paths.test.mjs`
  run for a `plugins/pipeline-core/` diff was not evidenced.
- **Briefing violation** (Elephant-side, disclosed by the Critic): the spec
  reference handed to the Critic
  (`scratch/dispatch-codexguardimport-1-spec-stripped.md`) retained the
  reviewed commit's own "Progress note" section, containing implementor
  conclusions about the diff — `backlog-item-strip-for-dispatch.mjs` strips
  Triage/Closure headings but not Progress-note ones, the same gap already
  tracked at
  `2026-09-06-backlog-item-strip-for-dispatch-does-not-remove-a-resolution-section.md`.
  The Critic reported that no finding in its report rested on that text.

## Remediation before round 2

F2: a completed full `node harness/scripts/verify.mjs` run, candidate
`d759316f` (a descendant of the reviewed commit, tree includes its change),
captured at `backlog/evidence/2026-09-06-nva-b-codexguardimport-1-verify-latest.json`
— exactly the one known, already-tracked PO-blocked failure
(`verify-suite-registration-tests`/`verify-suite-registration-check`/
`suite-registration-check`), otherwise green.

F3: `check-consumer-safe-paths.test.mjs` captured at
`backlog/evidence/2026-09-06-nva-b-codexguardimport-1-safe-paths.txt` (9/9
pass).

F1: no further remediation available — the commit already exists; the T1
review this registry documents is the independent read the process owes.
