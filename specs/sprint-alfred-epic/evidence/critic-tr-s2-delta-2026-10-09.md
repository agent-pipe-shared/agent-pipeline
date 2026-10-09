# Critic delta review: TR-S2 execution-lane credential classifier (2026-10-09)

Persisted by the Elephant from the Critic's returned report. The Critic agent has no Write tool, so it could not persist
`critic-notes.md` itself and disclosed this under CR-06-D. The content below is the Critic's report. Only the
Markdown structure was normalised; no finding was added, removed or reworded.

- **Route:** requested `claude-opus-5-5` at max. The effective identity `claude-opus-5-5` was observed in the
  dispatch's own runtime prompt. Route pre-check passed (SECURITY class).
- **Assurance:** functional-equivalent-read-only; OS isolation is not asserted.
- **Review object** (four enumerated commits; the Critic built the diff itself with `git show`/`git diff`):
  - `8bb83c3c1` T2 (test, RED)
  - `ecf4bad93` T3 (test)
  - `667b04336` T4 (test; Commit-Act: orchestrator)
  - `8328f56bb` F2b (module fix)
- **Findings registry input:** `scratch/briefings/tr-s2-findings-registry.md`, IDs and gap titles only.

## 1. Findings

**None.** No candidate survived the Phase B evidence gate.

## 2. Deliberately not flagged (categories 1–11 cleared)

1. **Spec fidelity.** The §3.4 TR-S2 requirements are satisfied:
   - Every argv token of every executable is matched.
   - The classifier is pure and synchronous, with an injected `readScript`.
   - Nested carriers are bounded at depth 3 (`ELC-DEPTH`).
   - Path forms are normalised.
   - Option-attached forms go through `variantsOf`.
   - `EncodedCommand` is refused outright.
   - Purity was confirmed: no require, import, child_process, fs, env or sync-spawn use.
2. **Scope.** Each commit touches exactly one file. The QG-04 split is honoured. The flat `lib/` path is the one
   Ruling 76(a) sanctions.
3. **Reachability.** The classifier is not wired into `evaluate.mjs` yet. That wiring is deferred to the signed tranche
   by design (Ruling 76(a)).
4. **Trajectory.** See §3.
5. **Test integrity.** The pins landed RED first, and the fix turned them green.
   - T3 and T4 contain insertions only; nothing was weakened.
   - The Ruling 106 pattern-option pins are present.
6. **Edge cases.** All of these are caught:
   - cwd accumulation;
   - quoted paths with spaces;
   - the wsl pass-through tail;
   - more than 8 wrapper hops;
   - encoded-flag evasion.
7. **Guardrails.** No secrets or machine paths. Fixture secret names are assembled from parts. Language is per ADR-0011.
8. **Security surface.** The classifier fails safe in two layers:
   - The position-independent `harvest` catch-all.
   - Secret patterns are on by default, with `noPattern` as the exception list, and are re-applied at each nesting level.
   - The bypass attempts all failed in the over-refusal direction, which is the intended direction (PO decision 6).
9. **Documented-instead-of-fixed.** The header's "known residuals" are genuine limits of static analysis.
10. **Dependencies.** None are new; the module has zero imports.
11. **Language.** Correct.

## 3. Trajectory check: consistent

- **Captures:** `evidence/TR-S2-F2b-20261009/{elephant-head,after,wsl}.txt` all show exit 0 and 322/322.
  - `elephant-head.txt` was taken at `8328f56bb`.
  - `git diff --stat 8328f56bb -- <module> <test>` is empty, so both files are unchanged since the fix commit.
  - All three captures are `dirty: true`. Capture-time cleanliness of the two files is inferred, not proven byte for
    byte.
- **Authorship:** trailers only. `667b04336` carries `Commit-Act: orchestrator`, which is a disclosed commit act on a
  test-only commit.

## 4. Briefing violations

None. The usual auto-injected context (CLAUDE.md, the git snapshot, memory) is disclosed.

## 5. Verdict: PASS

| Prior finding | Status | Where it is fixed |
|---|---|---|
| F1 encoded command | CLOSED | `:913-918`, `:519`, `:525`, `:933` |
| F2 fake-reader negatives | CLOSED | `exemptScripts` at `:208-218`, `:556-560` |
| F3 name patterns | CLOSED | `:192-206`, `:320-327`, `:642-731` |
| F4 positional .ps1 read | CLOSED | `:926-927` |
| F5 preloads, operands, wrappers | CLOSED | `:786-848`, `:758-769` |
| F6 bash unescape | CLOSED | `:353-377`, `:1025-1032` |
| F7 `-Name:value` split | CLOSED | `:284-285`, `:930-932`, `:946` |
| F8 unreadable script refuses | CLOSED | `:563-565` |

Line numbers refer to `lib/execution-lane-credential.mjs` at `8328f56bb`.
