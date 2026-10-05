# 0.7.0 integrated stage plan v3 (DRAFT, scratch, no authority) — 2026-10-04

Basis: PO decisions 2026-10-04 (restructure interleaved with R1–R6; legacy deletion with migration,
comprehensive now; protected-baseline changes as ONE signed quality package per stage; intermediate
candidates per stage), Fable reviews (`scratch/fable-review/process/process-findings.md` PF-1…PF-36,
`scratch/fable-review/modules/module-proposal.md` MP-1…MP-7 / CD-1…CD-17), wave plan v2 draft.
Persist into the tracked plan revision when the HF10 package has landed (tree is HEAD-bound until then).

## Execution rules learned today (binding for every dispatch)

- One committing agent at a time in the shared checkout (parallel commits trip transient
  `GUARD-LIFECYCLE-NOT-READY partial`); read-only analyses may run in parallel.
- One tool call at a time inside a dispatch (parallel calls → `counter-lock-busy`, record collisions).
- Step 0 of every dispatch: the installed `pipeline-start-preflight.mjs` (exact command the guard prints).
- Protected-baseline paths (PB-GUARD-HOOKS, PB-SANCTIONED-WRITER, PB-CONTRACT-TESTS,
  PB-VERIFY-REGISTRATION, PB-BASELINE-*) are never edited in place: the stage's goldfish builds them in
  `scratch/qp-<stage>/`, a builder emits a `pipeline.signed-quality-package.v1` request, Critic reviews
  the package, the PO signs once (`sign-intent --request`), the agent applies (materializer `apply`),
  authorizes (`authorize-commit`) and commits with `Dispatch: quality-package-<sha> (integration)`.
  Unprotected files of the same stage land as ordinary goldfish commits BEFORE the package is built
  (the package binds HEAD and a clean tree).
- After every intermediate candidate the PO refreshes the installed plugin AND the git-hook snapshots
  (commit-msg, pre-commit) — or the refresh flow does both (backlog item hook-snapshots).

## Stages

| Stage | Content | Protected? | Fable / R refs | Size | IC |
|---|---|---|---|---|---|
| W0-3 rest | HF10 package (pilot) | PB | — | S | — |
| W0-3t | Hotfix 1–10 regression tests as regular tests (no new suite files; extend existing registered suites) | partly (guard-lifecycle-ready.test is not PB; guard-testpath tests are) | — | M | — |
| S0 | Freeze + definition-count ratchet test for duplicated helper names | no | MP S0 | S | — |
| S1 | `lib/shared/{digest,fs-atomic,closed-shape,lock,path-containment}` behind facades; migrate callers in non-protected modules; fix plugin→harness import | mostly no; PB callers via package | CD-1…CD-5, R4 K3-9/10/13 | M | **IC-1** (with W0-3 + W0-4) |
| W0-4 | `approved` limbo: status-independent write lane (scratch/backlog/docs + every named recovery) and ready-gate accepting every writer state | PB (guard) | PF-1, PF-8, PF-12 | S | IC-1 |
| S2+R1+R2 | guard split into ≤500-line facade + `lib/guard/*` lanes; ONE command catalogue (data) consumed by producers and guard + consistency test; ONE read-policy module; implementation-entry rule owned by the library | PB (guard) | MP-1, PF-13, PF-10/11, R1, R2 | L | **IC-2** |
| S3+R5 | state-writer split (facade + store + continuity + verbs + PO-authority + feature-package + closed-evidence) with a `commands` table for the R1 catalogue; one `authority` record per submission; `approved` removed as resting state (approve-plan = entry readiness + verify binding + phase flip); simplified design-course ledger with `revise` | PB (writer) | MP-2, PF-1, PF-20…24, PF-3…6, R5 | L | **IC-3** |
| S4/S5+R3 | override and push splits; one human-approval route resolver; compact signing prompt (+ file); signed checkpoint pushes + pre-push hook; signing window from hand-over | partly | MP-4/5, PF-17, PF-30…32, R3 | M+M | **IC-4** |
| R4 | platform parity sweep (on S1 primitives), role-route preflight, model-family approval, Antigravity/Codex items | partly | R4 | L | IC-4 or IC-5 |
| S6+recovery | onboarding/continuity by lifecycle stage, session-cleanup triplication folded; recovery RV-1…RV-11 incl. external CLI | partly | MP-6, CD-10, §20 | L | **IC-5** |
| S7 | legacy deletion batch with typed migration hints; cross-check the three project repos (read-only) for state shapes before deleting readers | partly | CD-6, CD-7, CD-9… | S–M | IC-5 |
| S8 + D | map/fitness re-cut into ≥8 governed modules; "established/active" architecture state with baseline ratchet; D1–D4 remaining; A1/C1 measurement | no | MP S8, PO model gap | M | **IC-6** |
| Q | full Verify, security scan, independent Critic over the whole delta, stamp 0.7.0, host matrix (PO runs P-4…P-6) | — | AC-32 | — | **0.7.0** |

## Design amendment

The restructure (S0–S8) and the PO decisions after approval exceed the approved sources' explicit
content. Prepare one design amendment (agent-only course per design-input #16: reopen-design, revise the
five sources, Advisor, readiness, present) — timing: before S2 starts, so S2/S3 run under approved
scope; the PO signs once at its final approval.
