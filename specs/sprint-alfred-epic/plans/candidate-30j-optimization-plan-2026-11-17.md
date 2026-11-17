# Candidate 30j: optimization plan from the state-machine analysis (2026-11-17)

Source: [state-machine analysis](state-machine-simplification-analysis-2026-11-17.md) (Fable, slice `C30G-SM1`), the PO tiles of 2026-11-17 (memory of the session, recorded in [queue C30-23](candidate-30-queue-2026-11-15.md)) and the open consumer items of [queue C30-24](candidate-30-queue-2026-11-15.md).

PO goal: take the essential optimizations into the next candidate **without taking a risk of new drifts**. This plan therefore selects by one rule and builds under six safety rules.

## 1. Selection rule

An item enters 30j only if all of these hold:

1. It removes a blocking the PO or a consumer session has actually met, or removes a known way to produce one (a forgotten copy).
2. It **derives** a fact on read from stored evidence or merges two copies of a list. It adds **no stored status**, changes **no record shape** and **no digest or key bytes** (analysis, DO-NOT-DO 3 and 12).
3. A failing-first case can show the defect before the change, and one named suite shows that the neighbouring behaviour is unchanged.
4. It needs no PO decision that is still open. Decisions already taken: E1-2 (hook refresh), E1-4 (journal write side), E1-5 (heal proves itself); E1-1 is ADR first.

Items that fail rule 2 or 4 go to 30k or wait (section 5).

## 2. Safety rules for building (they are the answer to "no new drifts")

1. **Test first, in the clone.** Every slice starts with a failing case that reproduces the defect; the slice's own check test pins the claim.
2. **Derive, never store.** A slice that would need a stored status is redesigned as a derived read or dropped.
3. **Disjoint write scopes per parallel slice**, each in its own clone, integrated one by one in a single integration clone (`integrate.mjs` pattern); slices that touch the same large file (`finish-feature.mjs`, `pipeline-state.mjs`) are one serial chain, never parallel.
4. **Neighbour suites, not only the new test.** Each slice names the suites of its direct importers (`direct-importers.mjs`); the integration run is one heavy run at a time on the integrated clone.
5. **Every repair path is reachable.** A refusal text a slice touches names a runnable command or a named human step; the contract test of the one-shot close (empty exception list) stays green.
6. **Rollback is the revert of the slice's commits**; no slice migrates or rewrites a stored record, so a revert needs no data repair. Old pending, ceremony and package records are read by the same rules as before.

No Critic and no Full Verify for this repository's candidates (PO rule); the honest label stays "implementation complete, targeted suites green, Verify and acceptance pending".

## 3. What goes into 30j

### Wave A: start immediately after 30i is applied (parallel, disjoint scopes, all small and low risk)

| Slice | Content | Analysis | Write scope (main files) | Proof | Why it is safe |
|---|---|---|---|---|---|
| A1 | One list for the nine package states and the inline phase set; a test compares the remaining mirror | C5, SM-1 | `check-artifact-topology.mjs`, `evidence-view-model.mjs`, one phase set in `pipeline-state.mjs` | `check-artifact-topology.test`, `evidence-view-model.test`, `feature-package-topology.test`, `external-reference-adapter.test` | values identical; no record affected. First step: settle E2-9 (why the checker holds a literal list); if on purpose, a comparison test replaces the import |
| A2 | A settled dispatch is not a running dispatch: an `unjudgeable` record whose reservation is settled `integrated` or `integrated-by-commit` is not listed as running | C1, SM-2 | `dispatch-record-liveness.mjs`, `dispatch-briefing.mjs` | `dispatch-record-liveness.test`, `dispatch-briefing.test`, `session-authority-repair.test` | read-only; an `alive` record always counts; `cancelled` is never proof; an unjudgeable record without proof is still announced |
| A3 | Failing-first reproduction of the blocked signature ceremony after a mistyped passphrase (test files only) | C3 part 1, SM-3 | `chat-gate-ceremony.test`, `po-human-approval.test` | those two suites | no production code; it decides whether the prefix rule (30k) is needed or the S6 fix already covers the case |
| A4 | Read-only proof of where the integration record is written and whether that step runs inside a registry boundary, with a failing-first case "a pending state survives its own integration" | C2 part 1, SM-8 | `native-goldfish-host-state.test`, `routine-repair.test` | those two suites | no registry code changes; it is the gate for A9 |
| A5 | One definition of an evidence-only follower commit (the definition only; every exact-HEAD check keeps its exact HEAD) | C12, SM-10 | `critic-course-admission` area | `critic-course-admission.test` | no check loosened; the package candidate stays bound to the exact commit |
| A6 | The onboarding producer exports its closed status list and its builder refuses a status outside it; the ready gate imports the list | C7, SM-5 | `project-onboarding-v3.mjs`, `project-onboarding-ready-gate.mjs` | `project-onboarding-ready-gate.test`, `project-onboarding-v3.test` | no stored record; every status and gate decision unchanged; check at the builder (a static extraction was tried and failed, so none is used). Medium file size: deep tier |

Five of these can run at once; A6 is the one to hold back if admission is slow.

### Wave B: after wave A is integrated (serial chains by file, plus independent slices)

**Chain B-close (one clone, serial, touches `finish-feature.mjs` and neighbours):**

| Step | Content | Analysis |
|---|---|---|
| B1 | A listed evidence file that was deleted by hand: the refusal names the route at the point of the refusal (put the original bytes back; if they are gone, a new feature and a PO discard), with a test | queue C30-24 item 9 |
| B2 | The package back-move after a declined acceptance is part of every one-shot run (idempotent; `recordLag` no longer persists); settle E2-16 first (does a rerun already retry it) | C6, SM-4 |
| B3 | `CLOSE-GATE-CHANGE-UNPROVEN` names a way out when a gate-definition change made mid-close makes the PO signature impossible (the order hint stays) | queue C30-24 item 10 |
| B4 | Critic addenda under an ignored `/evidence/` path: check the generated `.gitignore` of onboarding and the addenda path; fix the one that is wrong | queue C30-24 item 7 |

**Independent slices in wave B (parallel with the chain):**

| Slice | Content | Analysis |
|---|---|---|
| B5 | The session bootstrap runs `refresh-mandatory-hooks.mjs` itself after a plugin reload when the attestation is good; hooks only, `nextAction` for the attestation stays null; the hook still refuses when stale | C11, SM-14 (PO tile E1-2: yes) |
| B6 | One source for the eight calibration path lists (constants and resolver of `project-authority-read.mjs`); both files, byte identity and `CVCT-TWIN-CAS` unchanged | C8, SM-6 |
| B7 | The write side of the legacy close journal is removed, `validateCloseJournal` and `readCloseJournal` stay; first step: read AC-047-27 and search the documents for a user of the writers, stop if one exists | C10, SM-13 (PO tile E1-4: yes) |
| B8 | ADR draft for E1-1 (what a Verify result covers when evidence-only follower commits follow the checked candidate). **Document only, no code**; the PO releases the ADR before anything is built | E1-1 |

### Wave C: only if its gate is met (otherwise 30k)

| Slice | Content | Gate |
|---|---|---|
| C1 | A pending state is retired by the step that integrates it (C2 part 2, SM-9) and heal proves "nothing in flight" from an integrated reservation or a dead owner process instead of the hand-given `--no-goldfish-running` (PO tile E1-5: yes); the flag stays as the fallback | A4 shows a clean registry boundary at the integration step AND A2 is integrated. The strict refusal for an armed or running bound member stays (DO-NOT-DO 9). Medium to high risk: deep tier, one slice, failing-first cases for "a running dispatch is never proven not in flight" |
| C2 | The ceremony's records are the truth and the member is the copy (prefix rule, ownerless `running` ceremony closed by the next start) | A3 shows the blocked state is one of the two windows of finding A7-4. If A3 shows another cause, the cause decides the fix and this item is dropped |

## 4. Order, parallelism and measurement

1. **Before any dispatch:** 30i applied, stamped on the PO's word, installed. Slices are built on the installed 30i state in new clones (heal first, with no Goldfish running).
2. **Wave A:** five or six clones at once, launched one at a time (admission is no longer slowed by the old reservations, see C30-23; the sequential launch stays the safe habit). Integrate in the order A1, A2, A5, A6, then A3 and A4 (tests only).
3. **Recon before dispatch (read-only, small):** E2-9 (the topology checker's literal list), E2-16 (does a rerun retry the back-move), E2-10 (is the State tracked in consumer projects, needed later for C9), where the integration record is written (A4 answers it). Each is a note in the briefing, not a guess.
4. **Wave B:** the close chain in one clone, B5 to B8 in parallel clones. B8 can start at any time because it is a document.
5. **Measure the optimizations, do not assume them:** before and after A2 and wave C, record the dispatch admission time (the baseline is not yet measured since the old reservations were closed: take it from the first dispatch of 30j and compare with the 250 s limit that refused three parallel admissions); after B5, the first commit after a plugin reload needs no hand refresh in a greenfield.
6. **One integrated suite pass** over the changed files and their direct importers (one heavy run at a time), one chain export, one rehearsal, then the PO applies; stamp immediately after "angewendet"; install on the PO's word. Full Verify only on the PO's word.

## 5. What is deliberately not in 30j, and why

| Item | Why not |
|---|---|
| E1-1 implemented (HEAD = candidate plus evidence-only followers) | PO tile: ADR first (B8). It changes what a Verify result covers. |
| C4, no owned output left uncommitted after a stop (SM-12) | medium risk; the tension with the Critic carry-forward (hand commit ends it) needs its own case; after the B chain proved that the back-move and the refusals hold, as 30k |
| C9, the discard record read at the candidate commit (SM-7) | precondition E2-10 (State tracked in consumer projects) is open; void if not |
| Retiring one calibration file (E1-3) | PO default: not now; B6 first, decide after it has run in one candidate |
| Any new stored status, any automatic re-bind of an immutable or append-only artifact, any automatic signature step, any time-based expiry | DO-NOT-DO list of the analysis |
| `WIN-AUTH-OPEN` in the Claude sandbox (consumer item 5) | host behaviour; the next Full Verify on a Windows host decides |

## 6. Expected effect

| Blocking today | Removed by | Residual |
|---|---|---|
| Dispatch warning `DBG-RUNNING-SCOPE-UNKNOWN` with nothing running | A2 | an unjudgeable record with no settled reservation is still announced (by design) |
| Manual `heal --no-goldfish-running` before a dispatch | C1 (conditional); the old reservations are already closed | flag stays as fallback |
| `HOOK-SNAPSHOT-STALE` on the first commit after a reload | B5 | attestation recovery stays human |
| Hand step after a declined acceptance (`recordLag`) | B2 | none known |
| Signature impossible after a mid-close gate change, deleted listed evidence | B1, B3 | the original bytes must exist or a new feature and a PO discard follow |
| A forgotten literal in a second state list | A1 | none |
| Wrong typed refusal for an onboarding status the mirror lacks | A6 | none |
| Eight private calibration path lists | B6 | the two twin files stay |

Open question for the PO before building: whether the ADR draft B8 may be written by the deep tier (Sonnet) or should be commissioned from Fable (needs a model exception recorded with `--by` supplied by the PO).
