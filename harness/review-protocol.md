# Review Protocol — Two-Stage Review

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3 · 2026-07-03

**Status:** Binding harness contract. Agent-facing, therefore English (ADR-0011). Operationalizes `docs/operating-model.md` §4 (review system) and §4.3 (escalation ladder), **ADR-0003** (isolation levels), **ADR-0005** (gate chain), **ADR-0014** (Critic contract), and **MP-07** (`policies/model-policy.md`). Precedence on contradiction: the decision register (`docs/state.md`) > ADRs > `docs/operating-model.md` > this file.

Governing principle: **deterministic before probabilistic.** Stage 1 is machine and blocking; Stage 2 is LLM judgment and produces findings for the Elephant's gate decision. Stage 2 never re-checks what Stage 1 enforces.

---

## 1. Stage 1 — deterministic gate chain (blocking)

**Rule:** The fixed chain **format → lint → typecheck → tests → build** runs as ONE verify script per project (`{{VERIFY_COMMAND}}` from `.claude/pipeline.json`). Stop hook, goldfish delivery, and CI execute the same command.
**Why:** Three diverging check paths are three truths (anti-pattern AP1); one script makes "green" unambiguous (ADR-0005).
**Check:** The evidence artifact names script + commit state + exit code; CI demonstrably calls the same command.

**Rule (evidence):** A delivery without a machine-written evidence artifact counts as NOT verified — regardless of what the report claims.
**Why:** "Reported done but not tested" is the documented main failure mode (P4).
**Check:** The artifact was written by the script itself (file/log); model-authored prose does not qualify.

**Rule (self-fix loop):** On red verify the goldfish fixes itself — max **2 failed attempts at the same problem**, then STOP + report with the failure state. Hard harness leashes: `maxTurns` in the agent frontmatter; stop-hook cap of 8 consecutive blocks.
**Why:** Beyond two attempts the hit rate drops; a fresh context with a better briefing beats grinding on (OM §4.3, rung 1).
**Check:** The stop condition is in every briefing; the completion report names attempts and failure state.

**Rule (gate honesty):** Every gate documents what it does NOT check. Gates are binary — sharp or deleted; warn-only only with an expiry date.
**Why:** False confidence in green gates is how unverified work slips through (anti-pattern AP7).
**Check:** The gate-honesty note travels with the evidence (DoD item A5, `harness/definition-of-done.md`); normative chain spec: `guardrails/quality-gates.md` (authored in parallel, Phase 3).

---

## 2. Stage 2 — Critic (judgment)

### 2.1 Trigger decision table

Inputs, fixed at triage and recorded in the task head: **rigor level** (0/1/2) · **risk class** (high/medium/low — normative definitions: OM §4.2; the project's `riskZones` from the calibration inform the classification) · **diff type:** does the diff touch **architecture / guardrails / security ("A/G/S")** — architecture principles, hooks, permissions, policies (also in this repo), secrets/auth, live-effective <PROJECT_B> changes? · OR is the diff **mechanical/deterministic** (lockfiles, generated artifacts, pure formatting with zero semantic delta)?

Evaluate all rows; the **strictest matching row wins** — a diff that superficially looks mechanical (T0) but ALSO matches a stricter row (T1–T4) is never exempted by T0. Row T1 additionally forces the isolation level:

| Row | Situation | Critic | Model / Effort | Isolation |
|---|---|---|---|---|
| **T0** | Mechanical/deterministic diff (lockfiles, generated artifacts, pure formatting, zero semantic delta) | none — auto-pass; evidence = the generating command + the `verify` gate output | — | — |
| **T1** | A/G/S diff — regardless of diff size and rigor level | MANDATORY | the higher-capability model | `--bare` + JSON-schema verdict MANDATORY, in addition |
| **T2** | Risk class high | MANDATORY | the higher-capability model | read-only subagent (Elephant may still choose `--bare`) |
| **T3** | Rigor 2, standard | MANDATORY | the review-tier model FIRST — escalate to the higher-capability model ONLY on (a) a finding ≥ major, (b) an A/G/S touch discovered during review, or (c) a contested/contradictory verdict (T6). The higher-capability model is never the first pass for a non-A/G/S rigor-2 diff. | read-only subagent |
| **T4** | Rigor 1 standard · risk class medium · rigor 0 WITH risk flag | MANDATORY, BLOCKING | the review-tier model FIRST — same cascade as T3 (escalate to the higher-capability model only on finding ≥ major / discovered A/G/S touch / contested verdict) | read-only subagent |
| **T5** | Rigor 0 + risk class low + no risk flag | none — verify + evidence suffice (fast path) | — | — |
| **T6** | Review-tier findings contested or contradictory | Elephant's option | a higher-capability-model second opinion | NEW fresh context — never a debate in the same context |

**Non-blocking option (risk class low only):** where T3 or T4 is triggered by rigor level rather than by risk class medium/high, and the diff's risk class is low (non-A/G/S), the critic run MAY proceed non-blocking — parallel to the next package's implementation dispatch — instead of gating it; ALL findings from that run are still dispositioned before the wave closes or before push. Risk class medium or high stays blocking; high + A/G/S additionally keeps T1's higher-capability-model-mandatory + `--bare` requirement unchanged (T1 row untouched, including the documented `--bare`-suspension status quo).

**Bundling default:** one bundled critic per delivery wave is the default; per-package critics run only when risk classes inside the wave differ from each other.

Canonical trigger wording (word-identical in `docs/operating-model.md` §3.3/§4.2, ADR-0003, and ADR-0014 — on any divergence the canonical wording wins over the table above):

> "Every architecture/guardrail/security diff runs with the escalated review-tier model (higher capability level) AND additionally in `--bare` isolation. Rigor level 2 makes the Critic mandatory (default: the review-tier model); escalation to the higher capability level applies there only when, in addition, the risk class is high OR an architecture/guardrail/security diff is present."

**Why staggered:** The Critic is expensive and must not decay into ceremony — a documented discipline-erosion risk; A/G/S zones are exactly where a weaker checker has correlated blind spots. Evidence for the cascade/non-blocking relaxation: the last 3 canon critics after a passed readiness check + first-pass delivery returned PASS with 0 findings; real blockers occurred only on risky live-code changes in a governed project (two blockers, one fail-open major finding). Community evidence: Meta's risk-tiered gating held quality at relaxed gates (incident rate 1/50 baseline).
**Check:** The gate decision documents the applied row; merge requires a findings report for every mandatory trigger (OM §4.2).

### 2.2 Input construction — by the Critic itself

**Rule:** The Elephant hands over **paths/refs + metadata only**; the Critic constructs its own input. The dispatch contains exactly:

1. Spec/delta-spec path (or the issue brief for rigor 0),
2. Diff reference (`base..head`, worktree path, or PR ref) — the Critic runs `git diff` itself,
3. Guardrail paths to check against (`guardrails/` files, relevant calibration constraints),
4. Evidence artifact path(s),
5. Metadata: task id, rigor level, risk class, applied trigger row + "criticality → model" (MP-07), ruleset SHA.

**Never in the dispatch:** chat history, Elephant reasoning or summaries of the work, goldfish completion-report rationale, prior Critic verdicts (a fresh run must not anchor).
**Why:** Two residual contamination channels are structurally closed: (a) CLAUDE.md/git-status autoload → `--bare` duty for A/G/S diffs; (b) Elephant framing → the Critic builds its input itself; the Elephant passes paths, never justifications.
**Check:** The dispatch text contains no prose about the solution; the Critic's bootstrap confirmation (`harness/session-bootstrap.md` §6.3); the trajectory section proves the Critic actually pulled diff/spec/evidence itself.

### 2.3 Isolation levels

| Level | Mechanics | When |
|---|---|---|
| **Standard** | read-only subagent: tools Read/Grep/Glob + narrowly scoped Bash for `git diff`/`git log`; NO `memory`, NO write tools | all mandatory triggers except T1 |
| **`--bare`** | separate `claude -p --bare` run with `--json-schema` verdict; skips ALL auto-discovery incl. CLAUDE.md and git status; context passed explicitly (`--append-system-prompt`, `--settings`); needs its own auth (`ANTHROPIC_API_KEY`/`apiKeyHelper`) | MANDATORY for T1 (A/G/S); optional escalation anywhere else |

**Codex native-host normal lane:** Codex maintainer/self-application reviews may use the
`criticNormal` host duty and `plugins/pipeline-core/scripts/codex-critic-host.mjs`.
The deterministic harness prepares a no-remote checkout and hash-bound packet;
the Elephant performs the native fresh-context dispatch; the finalizer checks
the captured result, evidence-bound liveness, source-qualified references, and
content fingerprints for the candidate plus mandatory `private` and `shared`
observers. Coordinator artifacts live below a private symlink-safe control
directory; each dispatch is single-use. Public receipts contain only closed
citations and hashes, and both PASS and FAIL emit a disposition receipt through
a crash-recoverable exclusive publication transaction. Its
receipt MUST say `normal-contractual-read-only; OS isolation not asserted`.
This lane is not a substitute for T1 isolation. A T1 use requires a named,
scope-bounded PO waiver and still creates no isolation/conformance claim (ADR-0035).
The v0.3 harness requires an explicit clean full Shared ruleset checkout that
is separate from the candidate source, at the same commit, and byte-matched to
the executing harness/routing/schema set. It does not infer authority from an
installed plugin cache. Review-checkout cleanup happens only after durable
receipt publication and is not review evidence.

Accepted trade-off (ADR-0003): the standard Critic sees CLAUDE.md + git status — full input isolation exists only at `--bare` level. Headless runs record `total_cost_usd` from `--output-format json` in the telemetry line (MP-20 headless convention). **Disclosure + snapshot-ban:** the standard-stage report names the auto-injected context observed (CLAUDE.md, git-status snapshot, memory); that injected git status/commit log is NEVER used as a freshness reference — diff range and commit state come exclusively from the dispatch (§2.2), confirmed via the Critic's own `git` commands.
**Check:** Writable tools available to a Critic = failed bootstrap → abort (wrong agent definition loaded).

### 2.4 Findings format (transfer format 3, OM §2.4)

Per finding — all four fields mandatory:

- **Gap** — what is missing or deviates vs. spec/guardrail,
- **Risk** — consequence + severity `blocker` / `major` / `minor`,
- **Evidence** — `file:line` or a concrete diff/artifact reference; claims without citation are inadmissible,
- **Spec ref** — the EARS criterion or guardrail rule concerned.

Mandatory report sections:

- **"Deliberately not flagged"** (canonical rubric name for the read-only Critic): aspects explicitly checked and found ok — distinguishes "checked, ok" from "not looked at". ("Deliberately NOT changed" remains the rubric of writing roles.)
- **Trajectory check:** were the claimed checks actually executed per evidence — command matches `{{VERIFY_COMMAND}}`, commit state matches the reviewed diff, exit code consistent? Verdict mandatory.
- **No overall score.** Binary pass/fail only where the Elephant explicitly requests a verdict — the `--bare` JSON schema always requests one.

### 2.5 Anti-overreporting

**Rule:** Search harshly, report honestly. "No findings" is a valid and welcome result; every finding must pass the evidence bar. Skip rule: nothing that CI/`verify` already enforces; no style critique without spec/guardrail reference; no score theater.
**Why:** "A reviewer prompted to find gaps will usually report some, even when the work is sound" (documented failure mode, ADR-0014). ~30 % valuable findings is a good yield — a padded 100 % is noise.
**Check:** The Elephant rejects rule-violating findings (§3); the "Deliberately not flagged" rubric makes omissions auditable, so anti-overreporting cannot silently flip into under-reporting.

**Prompt framing:** Hunt-style reviews (bug/security hunts) are dispatched with unproven **negative-thesis priming** ("this code very likely contains many defects …") combined with the evidence gate — the two-phase pattern "search harshly, report honestly" (OM §2.4). The canonical prompt wording lives in `templates/prompts/critic-review.md`.

---

## 3. Verdict processing by the Elephant (gate decision)

**Rule (validate first):** Findings that violate the skip rule or lack evidence are rejected with a short note — no debate.
**Rule (disposition):** EVERY blocker/major finding receives exactly one disposition: **fix** (rework dispatch) · **reject with recorded justification** · **escalate to the PO**. Minor findings: fix now, file as backlog item, or reject.
**Rule (rework):** Rework is a **NEW dispatch with fresh context and a refined briefing** — never continued work in the failed context. BEFORE any re-dispatch or model escalation, run the harness checklist (P1 / `policies/tooling-policy.md` G2): (1) briefing complete and consistent? (2) context clean? (3) tools/permissions right-sized? (4) hooks/gates wired and actually run?
**Rule (cycle cap):** Max **2 rework cycles per task**, then the PO — mandatory, no exceptions.
**Rule (re-review):** After rework, the trigger table (§2.1) re-applies to the new diff; mandatory triggers → a NEW fresh Critic run. A Critic context is never reused — it would anchor on its own previous findings (same rationale as the readiness-check repetition rule, OM §3.4).
**Rule (no dialogue):** There is never a Critic↔Goldfish dialogue; the Elephant mediates via briefings.
**Why:** Findings without dispositions rot; unbounded rework cycles are the expensive form of grinding; a reused reviewer stops being fresh.
**Check:** The gate decision records the applied trigger row, the disposition per finding, and the cycle count; a telemetry line exists per Critic run; merge blocks without a findings report where the trigger was mandatory.

Model escalation inside rework follows **MP-05** (criterion 3: same task class failed on the implement-tier model despite an improved briefing → next lever is the model).

---

## 4. Escalation ladder (complete)

| Rung | Owner | Hard abort/escalation criterion |
|---|---|---|
| 1 | Goldfish itself | verify red: max **2 failed attempts at the same problem** → STOP + report with failure state. Harness leashes: `maxTurns` frontmatter; stop-hook cap 8 consecutive blocks |
| 2 | Critic | delivers findings only — **no dialogue with the goldfish, no own fixes** (read-only) |
| 3 | Elephant | dispositions every finding (fix / reject with justification / the PO); harness checklist BEFORE re-dispatch or model escalation (G2/P1); rework = fresh context + refined briefing; max **2 rework cycles per task** |
| 4 | the PO | MANDATORY on: blockers, > 2 rework cycles, irreversible/externally visible/costly matters, spec↔reality conflict, budget overrun (criterion: `policies/model-policy.md` MP-20) |

Flow diagram: `docs/operating-model.md` §4.3 (normative; this table is its operational summary).

---

## 5. Time-shifted second look (irreversible gates)

**Rule:** Before irreversible, externally visible, or costly decisions, put deliberate time distance between draft and final approval (another day, or at least a clearly later session segment); the decision is re-read against spec and register BEFORE the human gate releases.
**Why:** Solo substitute for the team review — time distance replaces the second human (Rensin; OM §4.2).
**Check:** For irreversible gates, the gate decision documents the time-shifted second look.

---

## 6. Open items

- **DECIDED:** Plugin implementation of the Critic — ONE agent + model invocation parameter (`plugins/pipeline-core/agents/critic.md`; no `critic-critical` fork). Resolves the MP-07 OPEN point (`policies/model-policy.md` MP-07).
- **OPEN (Phase 4):** versioned `--bare` wrapper script + JSON verdict schema file (field-identical to §2.4; today the shape lives as a comment contract in `templates/prompts/critic-review.md`).
- **OPEN (Phase 4):** PreToolUse protection of test paths.
- Canonical prompt wordings shipped (Phase 3): `templates/prompts/critic-review.md` (negative thesis), `templates/prompts/goldfish-task.md`, `templates/prompts/elephant-kickoff.md` (anti-sycophancy).
- **OPEN (Phase 4):** Per-project risk-zone lists and worked trigger examples land with the migration dossiers.
