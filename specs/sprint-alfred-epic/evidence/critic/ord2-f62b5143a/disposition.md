# Disposition: ordinal-2 correction review of e6fec04a0..f62b5143a

Review object: the 25 enumerated commits `e6fec04a0..f62b5143a` (head tree `8cf0822b9`), Critic on
`claude-opus-5-5` at max, functional-equivalent-read-only lane. Verdict: FAIL on F-A and F-B
(major); F-C, F-D and F-E are minor; F-F was withdrawn by the Critic itself. The report is
`critic-notes.md` beside this file. The review is advisory, like the one before it: no finalizer
receipt exists for this batch (`backlog/items/2026-10-20-a-running-batch-has-no-admissible-critic-route.md`).

An earlier dispatch of the same round stopped at the reference boundary: its briefing said the
range carried no retained prior result, although `21e3a466b` added one. The round was dispatched
again with correction input bindings (four coordinator-only paths, and the commit messages that
cite prior findings) and is the one recorded here.

| ID | Severity | Disposition |
| --- | --- | --- |
| F-A | major | Accepted; no retroactive fix, because D55 Q12 does not rewrite history. The commits are listed below. D55 Q11 ratified the EL-01 exception only for the D54 work and the PF-54 commits; it does not cover the D56 work, and D56 (4) states no EL-01 exception. That is PO decision Q14. The `Dispatch: D<n> (elephant-exception)` form cannot be used from this session yet anyway: the installed plugin's commit guard predates `00ef3108d`. The governed Goldfish route is refused for the corrections too. With the approved course, every productive dispatch needs item admission, and item admission needs an acceptance row in the signed Spec that names the item (`DBG-AC-ROW-MISSING`). The signed Spec has no row for these items (measured 2026-10-20). Only a PO-approved Spec amendment opens that route. So the Elephant also builds the corrections, and they fall under Q14 as well. Each correction commit says so in its body. The verifier's stage-0 bound (10 paths) disagrees with the operating-model criterion (at most 2 files, about 25 lines); that becomes a backlog item. |
| F-B | major | Accepted, fix now. The unprotected half lands in this correction, built by the Elephant under Q14: the resolver in `lib/project-authority.mjs`, readers that read both places, `lib/pipeline-owned-files.mjs`, `lib/human-guard-override.mjs`, the tests and the docs. The ledger's new place is resolved from the common Git directory, never from `<root>/.git`. The only writer, `hooks/guard-git.mjs`, is protected, so the write-path change is ceremony C13. That ceremony is now on the critical path of this candidate. |
| F-C | minor | Accepted, fix now (Elephant, Q14). `scripts/commit-pipeline-owned.mjs` commits without trailers by default, as a PO terminal commit should: the installed git `commit-msg` hook demands the provenance pair only once a message signals it. An explicit caller flag adds `AI-Assisted: true` and `Dispatch: stage-0 (elephant)` for an agent-run commit. The PF-36 pin in `push-prepare.test.mjs` changes with it. |
| F-D | minor | Accepted, fix now (Elephant, Q14). The close consumes the authorship classification and reports the `unrecorded` slices, as the module comment says. The pin case goes into the existing `close-coordinator-refuses-a-required-critic-without-evidence` pin. |
| F-E | minor | Accepted; PO-only. Ceremony C14 registers `architecture-boundary-check.test.mjs` in the protected `harness/verify-suites.json`, merged with C11 and C3. The exact Edit has been prepared and checked offline. |

## F-A provenance: Elephant-built commits in the range

Measured with `git show --numstat`. "Code" counts `.mjs`, `.js` and `.json` paths outside
`backlog/`, `specs/` and `docs/`. Stage-0 per the operating model is at most 2 files and about 25
lines.

| Commit | Paths | Code paths | Lines | Basis by subject |
| --- | --- | --- | --- | --- |
| 34835cc8e | 6 | 6 | 305 | D54 (1), Q11 |
| 077305363 | 2 | 2 | 69 | D54 (2), Q11 |
| 4dd82e715 | 7 | 3 | 326 | FB3-PF-55, D56 (4) |
| 62a8e2719 | 9 | 8 | 248 | PF-31/36/40 and PF-32/33, D56 (2) and (3) |
| 1c3b2b096 | 10 | 10 | 254 | D52 (2) and the Critic disposition, D54 (2), Q11 |
| 4457e2680 | 1 | 1 | 67 | D55 Q9 (1) pin, D54 (2) |
| cf658960c | 6 | 3 | 223 | PF-34, D56 |
| 00ef3108d | 9 | 5 | 55 | D55 Q12 |
| f0789bbd4 | 1 | 1 | 1 | genuine stage-0 |
| 8ed2def1f | 7 | 6 | 1244 | FB3-PF-54 first stage, D56 (1) |
| 40c74a01e | 4 | 3 | 136 | D55 Q1 |
| 455b4af21 | 1 | 1 | 58 | pre-existing red, D54 (2) |

The remaining 13 commits of the range are docs, backlog and generated artifacts.
