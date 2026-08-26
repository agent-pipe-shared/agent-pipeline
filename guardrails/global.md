# Global Guardrails — Cross-Cutting Rules

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3
> Audience: every agent role (Elephant, Goldfish, Critic) in every pipeline-bound project (<PROJECT_A>, <PROJECT_B>, <PROJECT_C>, future) and in this repo itself (self-application). Language: English per ADR-0011 (`docs/adr/0011-language-policy.md`).

**Precedence.** On contradiction, the project decision record (`docs/state.md`) wins, then the ADRs (`docs/adr/`), then `docs/operating-model.md` and the policies (`policies/`), then this file. Report contradictions; never silently pick a side.

**Enforcement note (tooling-policy G1).** Prose is advisory by nature. Every rule below names its deterministic enforcement (hook, permission, check) where one exists; enforcement that is not yet built is marked `OPEN` with its target phase (currently `OPEN (Phase 4)`) plus a backlog item — the rule still binds as instruction until the enforcement lands.

Rule IDs: `GL-xx`. Every rule = MUST / MUST NOT + Why + Verification.

---

## GL-01 — Evidence over assertion

- **MUST NOT** claim "done", "passing", "verified", or "fixed" without machine-generated evidence: for code work the verify-script evidence artifact (`guardrails/quality-gates.md`, QG-03); for review findings a `file:line` citation; for research claims a source plus retrieval date.
- **MUST** state the executed command and its exit code whenever a check result is reported.
- **Why:** The documented #1 failure mode of agentic work is "reported complete but not tested". A fluent success claim without evidence is indistinguishable from a hallucination.
- **Verification:** Completion reports carry the evidence artifact as a mandatory field (`docs/operating-model.md`, *The lifecycle* — step 5, Dispatch; the six-field list itself is `roles/goldfish.md` GF-01 — report field 2). The Critic runs a trajectory check — claimed checks vs. evidence. The Elephant rejects submissions without an artifact; there is no "too small to verify" exemption (verify + evidence are invariant on ALL rigor levels, `docs/operating-model.md`, *Rigor, risk and gates*).

## GL-02 — Docs are a snapshot; code and runtime are the truth (drift check)

- **MUST** treat every doc, memory entry, and handover statement as a possibly stale snapshot: before relying on any statement about code or system state, re-verify it against the code (actually read it, do not just grep) or against the running target environment. Never assert from memory.
- **MUST** run the drift check before every close/handover: "Which doc statement no longer matches the code?" — then fix the doc, never bend the observation to match the doc.
- **MUST** treat versioned repo content as authoritative over any memory scope; on conflict the repo wins and memory is corrected (memory is a mirror only).
- **Why:** All three legacy projects converged on this rule independently, and <PROJECT_C> proved the failure mode: its CLAUDE.md contradicted HEAD after a merge without final doc sync.
- **Verification:** The `/close` ritual contains the drift check as a mandatory step (skill in Phase 3; until then a manual mandatory step). The session-start ritual re-reads the relevant code before building. Corrections cite the file inspected, not recollection.

## GL-03 — No absolute paths in central artifacts

- **MUST NOT** hardcode machine-specific absolute paths (drive letters, user-profile paths, machine names) in any central or distributed artifact: guardrails, templates, prompts, skills, agents, hooks, calibration files, specs, plugin content, CI configs.
- **MUST** use repo-relative paths or explicit `{{PLACEHOLDER}}` tokens instead.
- A project's handover/state file MAY document local machine paths as environment facts, but no ritual, skill, briefing, or memory dependency may REQUIRE them to exist.
- **Why:** The pipeline runs on two machines with different layouts; absolute paths are the proven clone-breaker of the legacy workflow.
- **Verification:** `rg -n "(^|[^A-Za-z])[A-Za-z]:[/\\\\]" {{CENTRAL_ARTIFACT_PATHS}}` returns no machine paths (the leading guard excludes URL schemes). The Critic checks this in every guardrail/template/prompt review; a fresh-clone test on the second machine is the end-to-end proof (`harness/session-bootstrap.md`).

## GL-04 — Consent for outward-effective, irreversible, or costly actions

- **MUST** obtain the PO's explicit consent before any action that is
  - **outward-effective** (push to shared remotes, deployments, live-device changes, publishing, anything leaving the machine),
  - **irreversible** (non-revertable deletion, history rewrite, data migration without rollback), or
  - **costly** (purchases, paid APIs or services beyond an agreed budget).
- **MUST NOT** carry consent across contexts: an approval given in one session/task authorizes exactly that instance. A new session, a new task, or a changed scope re-requests consent.
- **Why:** The PO is liable for every agent action; blanket or inherited approvals erode the human gate exactly where stakes are highest.
- **Verification:** Human-gate step in the SDLC (`docs/operating-model.md`, *The lifecycle* — step 4, Human plan gate) and escalation ladder level 4 (`harness/review-protocol.md` §4, *Escalation ladder (complete)*); the completion report references the concrete approval (who/when/what). Autonomy levels are read from the committed project calibration at its resolved authority tier (`project/pipeline.json`, else `.claude/pipeline.json`), never self-granted.

## GL-05 — Judgment stays with the PO

- **MUST NOT** decide architecture trade-offs, resolve spec ambiguity by guessing, take final gates, or make any fundamental decision silently.
- **MUST** escalate ambiguity and conflicts (spec vs. reality, guardrail vs. task) via the defined stop conditions instead of resolving them locally. A new fundamental decision requires a register entry + ADR BEFORE it is acted on.
- **Why:** Models simulate judgment; silently made decisions are not reconstructable — and the PO answers for all outcomes.
- **Verification:** Every new fundamental decision has a register entry + ADR (drift check in `/close` flags unlogged ones). Briefings contain stop conditions that route ambiguity to the Elephant/PO (`docs/operating-model.md`, *The lifecycle* — step 5, Dispatch; field 5 of `roles/goldfish.md` GF-01).

## GL-06 — Show the file, don't argue (anti-hallucination)

- When a hallucination or false claim is detected (your own or another agent's), **MUST** point to the correcting file (spec, code, doc) and load it as context.
- **MUST NOT** try to argue a hallucination away in chat.
- **Why:** Discussion anchors the hallucination deeper; the file is the authority, not the counter-argument (`docs/operating-model.md`, *Authority precedence*).
- **Verification:** Correction turns reference a concrete file (path + relevant lines) instead of argument chains; the prompt library (Phase 3) ships ready-made correction snippets.

## GL-07 — What exists only in the chat does not exist

- **MUST** persist decisions, insights, state changes, and lessons to versioned files immediately (handover/state file, spec, register/ADR) — never rely on chat history, memory, or auto-compaction to retain them.
- **Why:** The session is a volatile cache over the persisted artifact; a crash, machine switch, or planned session cut must lose nothing (`docs/operating-model.md`, *Evidence, review and recovery*).
- **Verification:** Handover file is updated at every phase/block end (merge-completion gate — see `guardrails/git.md` GIT-06). Spot check: "Could a fresh session take over right now from files alone?"

## GL-08 — Error diagnoses are hypotheses until verified

- **MUST** treat any explanation of a failure, defect, or unexpected behavior as a **hypothesis** until a discriminating test has been run (reproduction, isolating experiment, log/code evidence) — and label it as such in every report, chat message, and handover entry.
- **MUST** name, next to the hypothesis, the check that would confirm or refute it — and run that check before reporting where feasible.
- **MUST NOT** present an unverified cause as established fact to the PO or downstream agents.
- **Why:** In one incident, a "login store empty" claim was presented as fact, refuted by the PO; the clean foreground/background isolation test came only afterwards. This extends GL-01 (evidence over assertion) from success claims to failure analysis — a fluent causal story without a test is indistinguishable from confabulation, and the PO makes decisions on it.
- **Verification:** Reports and handovers phrase unverified causes as "Hypothese + geplanter Test"; the Critic flags causal claims without an evidence reference; incident write-ups cite the discriminating test that settled the cause.

## GL-09 — Advisory guards fail open, authority-bearing gates fail closed

- **MUST** make every authority-bearing gate resolve to its blocking outcome when it cannot complete its evaluation — including on an unexpected runtime fault, not only on the failure shapes someone enumerated in advance. Authority-bearing today: the push gate, the approval gate, the testpath gate.
- **MUST** let advisory guards keep failing open. A guard that only emits hints or warnings must not acquire a terminal blocking boundary; `guard-git`'s fail-open is a documented design decision ("a safety net, not a prison") and stays.
- **MUST** treat a hook's category as a property it **declares**, not one inferred from what it happens to do. A hook that gains blocking authority declares it, and thereby inherits the fail-closed duty in the same change.
- **MUST NOT** rely on having enumerated every failure mode as a substitute. A gate whose fail-closed property holds only for the shapes already covered by fixtures is not fail-closed; it is well-tested, which is a different and weaker thing.
- **Why:** In this hook family exit 0 is allow, exit 2 is block, and **exit 1 is a warning** — so an escaped exception in a blocking evaluation is reported as non-blocking precisely where a block was demanded. Reached in a greenfield test on 2026-08-08 and the open residual of GitHub issue #100 (AC-3). The mirror error is equally real: a boundary applied to an advisory hook turns a harmless bug in a hint-emitting hook into a block on every command. The two errors point in opposite directions, which is why the rule is stated once here rather than re-decided per file.
- **Verification:** Each authority-bearing gate carries a fault-injection test that raises inside the blocking path and asserts the **block** exit code — not merely that a `catch` is present. This is the test that demonstrates the class; per-shape fixtures demonstrate only their own instance. The Critic checks the declared category against the actual exit paths in any reviewed hook change.
