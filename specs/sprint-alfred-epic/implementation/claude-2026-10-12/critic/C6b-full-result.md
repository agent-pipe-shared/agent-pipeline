# Critic C6b FULL — result (persisted by the Elephant)

The Critic could not persist its own notes, so the Elephant persisted this record.
The guard refused the notes lane with `DISPATCH-BUDGET-CRITIC-NOTES-UNAVAILABLE`.
That is the AC-144 symptom: the installed guard build predates `facf39659`.

- **Route:** claude-sonnet-5-5 at high. The effective identity matched.
- **Lane:** `functional-equivalent-read-only`.
- **Batch:** `facf39659`, `79f2919f7`, `a6aa8705d`, `65660d4cf`.
- **Verdict:** FAIL. One major finding, three minor, no blocker.
- **Trajectory:** not verifiable. The RED/GREEN claims are self-reported, there is no tracked verify log, and authorship rests on the Dispatch trailers.

## Findings

| ID | Severity | AC | Commit | Gap | Evidence |
|---|---|---|---|---|---|
| F1 | major | AC-185 | 79f2919f7 | Clause C ("the producer retries index.lock once internally") is not implemented. The producer stays render-only. It emits an `onIndexLock` field that no caller reads and an instruction in prose, and the pin only asserts the field. | `lib/goldfish-commit-command-flow.mjs:14-15,29,58-60`; `lib/pins/goldfish-budgets-omit-the-closing-ceremony.test.mjs:59-63`; backlog item `:35-44` |
| F2 | minor | AC-148 | 65660d4cf | The pin uses hand-built spellings in a synthetic state. The headline `design-advisory-admission.mjs inspect` case and DLR035 stay uncovered, with no owner or due date (QG-06). | `lib/pins/denial-names-a-diagnosis-it-refuses.test.mjs`; backlog item `:23-27` |
| F3 | minor | AC-144 | facf39659 | Nothing tests that the off-Windows branch refuses a wrong mode. `modeIs` reads `process.platform` directly although the file injects the platform at `:1055`. The pin header still says own-create "stays RED" on Windows. | `hooks/guard-dispatch-budget.mjs:615,627,631,638,645,1055`; `lib/pins/critic-scratch-notes-write-is-refused-again.test.mjs:11-13` |
| F4 | minor | AC-247 | a6aa8705d | The sweep samples states by rotation, while the test titles say "every state". | `lib/pins/scratch-must-remain-writable-across-lifecycle-states.test.mjs` points 1-3; backlog item `:49-59` |

## Not reached

- The verify wiring of the pin files (`harness/verify-suites.json`, `harness/scripts/verify.mjs`).
- `launchRead`.
- Repo-wide consumers of `onIndexLock`.
- Other emitters of `design-advisory-admission.mjs inspect`.
- ADR-0063 placement of `lib/pins/`.

## Elephant disposition

- **F1:** a PO decision (topic list). The producer is render-only by design, so an internal retry would mean the producer runs git. AC-185 stays partial until the PO rules.
- **F2-F4:** one Correction Goldfish (C6B-CORR) gets them. Then at most one DIFF Critic, or an Elephant self-verify.
