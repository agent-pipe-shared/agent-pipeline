# Definition of Done (DoD)

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3

**Status:** Binding harness contract. Agent-facing, therefore English (ADR-0011 — primary readers are Elephant/Goldfish/Critic sessions and the plugin skills). Operationalizes **ADR-0005** (two-part DoD), the process-toll table in `docs/operating-model.md` §3.3, and the three-valued verification-status practice inherited from an earlier project. The deterministic gate-chain semantics are specified in `guardrails/quality-gates.md`; the review flow in `harness/review-protocol.md`; session duties in `harness/checklists/`. Precedence on contradiction: the decision register > ADRs > `docs/operating-model.md` > this file.

---

## 1. Principle: one DoD, two natures

**Rule:** "Done" has exactly two parts, and both are required. **Part A (machine-checkable):** the deterministic gate chain plus a machine-written evidence artifact — enforced by verify script, stop hook, and CI. **Part B (judgment):** Critic findings processed and, where triggered, the human gate passed. Neither part substitutes the other.
**Why:** The documented main failure mode of agentic work is "reported done, but never tested". Machines are cheaper and more reliable for everything checkable; spec fidelity, scope, and edge cases need judgment (ADR-0005).
**Check:** The gate decision records both halves: evidence-artifact reference (A) and findings disposition / human-gate result (B).

**Rule (no double work):** Part B never re-checks what Part A enforces — the Critic's skip rule.
**Why:** LLM re-checking of machine-enforced facts produces noise and cost without safety.
**Check:** Findings that only repeat CI/verify facts are rejected by the Elephant (`harness/review-protocol.md` §2.5).

**Rule (report ≠ status):** A goldfish reports per-check results; it never declares its own work "done". Status is assigned at the gate decision (Elephant) or the human gate (the PO).
**Why:** Self-declared completion is self-validation — the exact failure mode the two-part DoD exists to prevent; judgment stays with the PO.
**Check:** Completion reports contain three-valued per-check results (§3) and no overall "done" claim.

**Rule (formulation):** DoD checks describe **observable end states** ("item stands in the level and can be picked up in PIE"), never activity lists ("implemented X, called Y").
**Why:** the "golden rule" of end-state formulation, inherited from an earlier project: an end-state criterion is verifiable; an activity list is only narratable.
**Check:** Each DoD check names a state an outsider could verify without reading the diff.

---

## 2. Reusable DoD checklist

Copy this block into the task/spec (rigor ≥ 1) or the issue/brief (rigor 0). Strike items the rigor matrix (§4) marks "—". Slots in `{{DOUBLE_BRACES}}` are filled from the project calibration (§5).

```markdown
### DoD — task {{TASK_ID}} · rigor {{RIGOR_LEVEL}} · risk {{RISK_CLASS}}

**A. Machine-checkable (blocking — invariant at ALL rigor levels)**
- [ ] A1 verify green: `{{VERIFY_COMMAND}}` ran the full chain format → lint → typecheck → tests → build; exit code 0
- [ ] A2 Evidence artifact: written by the script itself (file/log), names command + commit state + exit code — never model-authored prose (reference implementation: this repo's own `{{VERIFY_COMMAND}}` = `harness/scripts/verify.mjs` writes `evidence/verify-latest.json`, schema `pipeline.verify-evidence.v0`, per `guardrails/quality-gates.md` QG-03)
- [ ] A3 Same-command rule: stop hook, delivery, and CI run exactly `{{VERIFY_COMMAND}}` — one truth for "green"
- [ ] A4 Test integrity: the implementing goldfish changed no tests/checks of its own implementation
- [ ] A5 Gate honesty: what the chain does NOT check is named next to the evidence (input for B6)

**B. Judgment (Critic + human)**
- [ ] B1 Critic ran per trigger table where mandatory (`harness/review-protocol.md` §2.1); findings report present
- [ ] B2 Every blocker/major finding dispositioned: fixed / rejected with recorded justification / escalated to the PO
- [ ] B3 Spec fidelity: all deviations reported, none silently built in — rigor 2 additionally: spec updated BEFORE merge
- [ ] B4 Completion report complete (6 fields, `docs/operating-model.md` §2.3) incl. "Deliberately NOT changed" rubric
- [ ] B5 Human gate passed where triggered: {{HUMAN_GATE}}
- [ ] B6 Everything not machine- or human-verified yet is listed honestly (feeds the 🟡 status, §3)

**C. Completion gates (merge/close moment — deterministic again)**
- [ ] C1 Merge-completion gate: handover file carries the new state
- [ ] C2 CLAUDE.md length gate: ≤ {{CLAUDE_MD_MAX_LINES}} lines
- [ ] C3 Lessons + doc sync done (rigor 0: bundling allowed); HISTORY "open/next" generated from or referencing the handover
- [ ] C4 Three-artifacts archive (rigor ≥ 1): problem/spec · acceptance criteria · result report
- [ ] C5 Telemetry line appended to `telemetry/costs.md` (MP-20)
```

**Why this shape:** A and B mirror ADR-0005's two parts; C repeats the deterministic nature at the merge/close moment — exactly where the documented handover drift of the legacy projects arose (anti-pattern AP3). The checklist is the per-task instantiation; the enforcing artifacts (hooks, skills) live in the plugin.
**Check:** Gate decision and close ritual reference the ticked list; a Critic flags implementations whose mandatory items are unticked.

---

## 3. Task status is three-valued (inherited from an earlier project)

**Rule:** A task/block carries exactly one status: **`done`**, **`🟡 not-human-verified`**, or **`blocked`**. Binary "finished" is forbidden vocabulary.

| Status | Definition | Assigned by |
|---|---|---|
| `done` | Every applicable A/B item green, incl. {{HUMAN_GATE}} where triggered. | Elephant (gate decision) or the PO (human gate) — never the implementing goldfish |
| `🟡 not-human-verified` | Part A green, mandatory Critic processed — but a human verification ({{HUMAN_GATE}}: PIE run, live devices, spot check) is still pending. | Elephant, listing exactly WHAT is unverified |
| `blocked` | A mandatory item cannot pass: verify red after the two-attempt rule, a stop condition fired, > 2 rework cycles, or a PO decision pending. | Goldfish (stop) or Elephant (gate), with reason + escalation rung (`harness/review-protocol.md` §4) |

Per-check results inside reports are three-valued as well: **pass / fail / not verifiable** (`docs/operating-model.md` §2.3, report field 1).

**Transition rules:**

- `🟡 → done` only through the named human verification; the clearance is recorded in HISTORY/commit (an earlier project's practice: "confirmed in PIE").
- **🟡-Merge rule:** the human gate no longer blocks the merge by default — it gates the **done declaration** only. Merge may proceed while a mandatory human verification (§4 / OM §3.2 step 9) is still pending when ALL of the following hold: (a) a **rollback anchor** exists — a pre-merge tag/commit reference recorded in the handover file ("a step-back to the previous state must always be possible in an emergency," the PO); (b) the project calibration documents a **per-project rollback procedure** (field `rollback`, OM §8); (c) the 🟡 entry **persists in the handover file** until the PO verifies it, and continues to count against the WIP limit; (d) **external effect is unaffected** — a 🟡-merge means the code lives in the repo; a live deploy still requires consent per the global rule (`guardrails/global.md`). If the project calibration defines verification as non-gating (e.g. spot checks), merge proceeds the same way and the 🟡 entry persists until cleared.
- `blocked → anything` only via the escalation ladder (`harness/review-protocol.md` §4) — never by silently re-running until green looks achievable.

**Prohibitions:** No `done` while a 🟡 item exists for the task. No silent clearing of 🟡. No reclassifying a `fail` as `not verifiable` to dodge `blocked`.
**Why:** the 🟡 marker, proven in an earlier project, is the honest answer to non-automatable verification — "name honestly what was not testable". The pipeline generalizes it to every project where deterministic gates do not reach.
**Check:** Every 🟡 has an entry in the handover file (grep-able); the close checklist enforces the listing; the Critic's trajectory check compares status claims against evidence.

---

## 4. DoD per rigor level (process toll, operationalized)

Invariant first: **A1–A5 (verify + evidence) are mandatory at every level — there is no path around the deterministic gates** (OM §3.3). Everything else scales with the rigor level:

**Rigor-0 eligibility (canonical definition):** `docs/operating-model.md` §3.3 carries the full stage-0 fast-path definition — size limits, exclusion list, risk-flag zones, worked examples. This table does not repeat it, it only lists the resulting DoD toll per rigor column; a task that fails the OM §3.3 criteria is not rigor-0 regardless of what this table shows.

| Requirement | Rigor 0 (issue-only) | Rigor 1 (delta spec) | Rigor 2 (spec-anchored) | DoD item |
|---|---|---|---|---|
| Spec artifact | short brief (still: goal, prohibitions, stop conditions) | delta spec + EARS + alternatives (short form: 1–3 bullets) | full spec + EARS + alternatives; evolves with the code | input to B3/B4 |
| Spec-readiness check | — | recommended; MANDATORY for architecture/guardrail/core-contract change, OR when risk class is high | MANDATORY | dispatch precondition (`harness/checklists/goldfish-dispatch.md`); Critic flags a missing mandatory check |
| verify + evidence | **MANDATORY** | **MANDATORY** | **MANDATORY** | A1–A3 |
| Test integrity + gate honesty | MANDATORY | MANDATORY | MANDATORY | A4–A5 |
| Critic | only with risk flag → then per trigger table | per risk class | MANDATORY (review-tier model standard; escalated to a higher-capability model per canonical trigger, `harness/review-protocol.md` §2.1) | B1–B2 |
| Human gate | only with risk flag | per criteria (OM §3.2 step 9) | default: yes | B5 |
| Worktree | per calibration (write scope) | per calibration | per calibration (default: yes) | dispatch precondition |
| Lessons / doc sync | bundled entry allowed | per block | per block | C3 |
| Spec maintenance after merge | — | spec may age (spec-first) | deviations reported + spec updated BEFORE merge | B3 |
| Three-artifacts archive | — | MANDATORY | MANDATORY | C4 |

**Why:** Process overhead must stay proportional to task size (OM §3.3; SDD critique: overhead ∝ 1/task size) — but size never protects against risk: the risk flag pulls Critic and human gate into rigor 0. A 3-line hook diff is still a guardrail change.
**Check:** Triage records rigor + risk class in the task head; the gate decision names the applied column; a Critic can reconstruct the applicable column from those two values alone.

---

## 5. Project slots

Slots come from the committed project calibration `.claude/pipeline.json` (field sketch: `docs/operating-model.md` §8). Never hardcode them — the pipeline runs on two machines with differing paths.

| Slot | Meaning | Calibration source |
|---|---|---|
| `{{VERIFY_COMMAND}}` | THE one verify script/command of the project | field `verify` |
| `{{HUMAN_GATE}}` | the project's human-verification form: `pie-human` / `live-devices` / `tests+browser` spot check … | field `verification` |
| `{{CLAUDE_MD_MAX_LINES}}` | context-economy hard limit for CLAUDE.md | field `claudeMdMaxLines` |
| `{{TASK_ID}}` / `{{RIGOR_LEVEL}}` / `{{RISK_CLASS}}` | per-task values from triage | task/spec head |

**Fail-safe:** Calibration file missing or incomplete → bootstrap case **F4** (`harness/session-bootstrap.md` §4): STOP for writing work. The DoD is never instantiated with guessed slot values.

---

## 6. Where the DoD is applied

| Moment (SDLC step, OM §3.2) | Actor | Items checked |
|---|---|---|
| Delivery (steps 5–6) | Goldfish reports; Elephant validates | A1–A5, B4 |
| Critic review (step 7) | Critic | uses A/B as review basis; flags unticked mandatory items |
| Gate decision (step 8) | Elephant | B1–B3, B6; assigns status (§3) |
| Human gate (step 9) | the PO | B5; clears 🟡 |
| Merge + close (steps 10–11) | Elephant (execution may be a goldfish) | C1–C5 |

---

## 7. Open items

- **Delivered:** Technical enforcement of A4 (protected test paths as PreToolUse rule) shipped in the plugin `plugins/pipeline-core` (`hooks/guard-testpath.mjs`, wired in `hooks.json` on `Edit|Write`; per-project scope via `.claude/guard-config.json` field `protectedTestPaths`, no config → no-op). Diff inspection by Elephant + Critic remains the backstop for the task-type nuance the hook does not resolve (see `guardrails/quality-gates.md` QG-04).
- `guardrails/quality-gates.md` is the normative spec of the A-chain semantics — delivered.
- **OPEN (Phase 4):** Per-project slot values (verify commands, human-gate forms, length limits) land with the migration dossiers; a project's worktree validation may adjust the worktree row.
