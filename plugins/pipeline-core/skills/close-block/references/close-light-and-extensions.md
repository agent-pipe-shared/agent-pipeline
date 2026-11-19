# close-block — extension contract, conditional steps and close-light (moved verbatim from SKILL.md)

Loaded on demand from `SKILL.md` at the condition each pointer there states. Every block below is the original text of the skill body, moved byte for byte; the comment line above each block names its place in the parent commit. Section headings that sat in the skill (`## Extension-point contract`, `### Strict feature-branch delivery extension`, `## Close-light variant`) stay in `SKILL.md` with the pointer under them.

## 1. Extension-point contract (extend WITHOUT forking)

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 112-122 -->
This skill defines two **named extension points**; the project hangs its own steps there via `ritualExtensions` in the project calibration at its resolved authority tier (`project/pipeline.json`, else `.claude/pipeline.json`):

- **`close.pre`** — runs as step 1, after the calibration read (step 0), BEFORE any of this ritual's own steps 2–11. **Repo state it sees:** HEAD and the working tree are exactly the state the block/session was in when this skill was invoked — none of the ritual's writes (handover, HISTORY, telemetry, retro item, final commit) exist yet (typical use: changelog sync, generated-docs refresh).
- **`close.post`** — runs as step 9, AFTER handover/telemetry/retro (steps 5–8), BEFORE the final commit (step 10). **Repo state it sees:** the handover update (step 5), HISTORY entry (step 6), retro item (step 7) and telemetry rows (step 8) are already written to the WORKING TREE, but HEAD is still the PRE-close commit — the final commit has not happened yet (typical use: project hygiene checks whose output should be committed with the close). **Hint for gate authors:** a hook here that reads HEAD's commit date/timestamp as "now" sees yesterday's commit, not this close — use system time (`date` / `Date.now()`), never HEAD's commit date, as the freshness reference.

Entry semantics (each entry is a string, executed in array order):

1. Invoke as a **skill** ONLY when the entry starts with `/` (e.g. `/acme-db-hygiene`) OR the WHOLE entry matches `^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$` — no whitespace, exactly one namespace colon (e.g. `pipeline-core:pipeline-start`).
2. Anything else → execute as a **shell command** from the project root. A colon inside a longer command line does NOT make it a skill: `pnpm run sync:changelog`, `npm run build:prod`, `docker run image:tag` are shell commands.

Rules: extension points not defined by this skill (e.g. a future `newBlockReview.post`) are ignored here. A failing entry STOPS the ritual with an explicit report naming the entry — never skip silently. **DoD anchor (hard):** a project-specific ritual step is addable via this file WITHOUT forking the central skill — forking restarts the copy-paste inheritance (anti-pattern AP1).

## 2. Steps 3b and 3c: transfer classification and bound-artifact transfer fidelity (`runtime-transfer` only)

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 136-139 -->
3b. **Transfer classification (`runtime-transfer` close-intent only; backlog `pipeline.spec-retention-on-close`, criterion 2)** — mandatory when this close's `--close-intent` is `runtime-transfer` (the PO is moving the work to another PC, CLI/runtime, or separately operated environment, incl. a Public/Private boundary crossing); skipped for `durable-stop` closes. This sub-step does not renumber the surrounding steps (same contract as 6b): run `node plugins/pipeline-core/lib/transfer-classification.mjs` BEFORE step 4's drift checks. A `blocked` result means at least one active PRD/Spec/acceptance-matrix authority named in `governance/spec-retention.json` would be omitted from THIS transfer without both a durable archive destination (an existing, bound archive-manifest entry) and an explicit recorded PO disposition (`governance/transfer-dispositions.json`, schema `pipeline.transfer-disposition.v1`) — leave the close unfinished, report the exact blocked id/key from the tool's findings, and do not proceed past this sub-step by re-running `checkSpecRetention` instead (that gate answers a different, later question: whether the archive already lost fidelity, not whether this transfer is about to omit an unarchived, undispositioned authority). A recorded disposition is never inferred from silence, an "obviously fine" omission, or a prior close's disposition for a different authority/key pair.
3c. **Bound-artifact transfer fidelity (`runtime-transfer` only):** before copying any device-local artifact bound by State, approval, or a gate receipt, prepare a local manifest under `scratch/` with schema `pipeline.bound-artifact-transfer-request.v1` and `artifacts` entries containing exactly `id` (a public opaque label), `sourcePath` (local custody reference), `classification` (`public`, `private`, or `unknown`), and `binding: {kind: "state"|"approval"|"gate-receipt", sha256: <exact digest from the existing binding>}`. This manifest is local custody input, never public evidence. Obtain classification from the source's documented classification; absent or ambiguous classification is `unknown`. Do not infer public classification from readability, a sanitized-looking filename, or transfer intent. Do not discover private State, credentials, or raw sessions for this step, and do not reconstruct missing approval-bound bytes from a derivative.

   Run `node plugins/pipeline-core/scripts/bound-artifact-transfer.mjs prepare --root <repository-root> --manifest scratch/<local-manifest>.json --output scratch/<new-transfer-directory>`. The producer reads only explicitly public, allowlisted relative evidence/document references, checks the bound digest and a deterministic privacy screen, writes byte-exact eligible artifacts plus a separate closed public projection and witness, and performs payload readback. It never redacts a bound artifact. `held` or `refused` means the transfer remains unfinished: record each opaque held ID with the exact instruction **"must be copied from the origin device"** in the handover; retain the original and its custody, and recover its original bytes through an authorized origin-device copy. Never treat a screened derivative as the digest-bound original. Unknown/private references are held without reading or echoing their paths. Unsupported descriptor-anchoring hosts return `BT-HOST-CAPABILITY`; use the same origin-copy recovery, never an ad hoc redactor. Only the separate `public-projection.json` is a public status report; it excludes source paths and artifact text. Local transport screening is not signature verification, publication approval, or a full security scan.

## 3. Step 6c, session-block rotation and size-gate bullets (threshold-triggered)

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 160-163 -->
   - **Session-block rotation (threshold-triggered, where the handover accumulates per-session/per-block prose in its head):** after step 5 updates this close's state in the head, check the handover file's size. Target: the operative head (re-entry pointer, environment, open items, next steps, plus any recently-kept session/block entries) stays **≤ ~25k tokens — readable in one pass** (the measurable goal this step protects). Over target, OR more than the last **2 full session/block entries** are sitting in the head → move the OLDEST entries verbatim (byte-for-byte, no paraphrasing) into the project's own archive file(s) (append-only; start a new dated file rather than growing one file without bound, e.g. per month) — keep only the operative sections plus the last 1–2 entries in the head.
     **For `docs/state.md` specifically, this half of the step is executable, not manual:** run `node plugins/pipeline-core/scripts/rotate-handover-sections.mjs` (dry-run) to see the plan, then `--apply` to write it. The script archives only entries that are simultaneously older than the retained newest N (`--retain-count`, default 2), carry no open marker (`(current)`/`(in progress)` in the heading), and are not cross-referenced from the never-rotatable tail sections (Operational head, Open items and next block, Observation publication queue, Re-entry, Recovery) — fail-safe toward retaining, never toward archiving something still live. Archive destination: `docs/state-archive/<YYYY-MM>.md`, one file per calendar month of the archived entry's own date. Regression coverage: `plugins/pipeline-core/scripts/rotate-handover-sections.test.mjs`. Never run `--apply` while this session's own work is still open in the head — only after this close's own entry has been written and is itself either retained (newest-N) or already closed by an explicit non-`(current)` heading.
   - No archive convention yet on this project (first rotation) → the script creates one automatically (a standard header on the first write to each new `docs/state-archive/<YYYY-MM>.md` file); report the new archive location(s) in the close report (bundled at the gate, not a separate mid-task confirmation — approval-fatigue, §4.2).
   - **Automated size-gate check (where `plugins/pipeline-core/scripts/handover-rotate.mjs` is present — ported from Nova's ADR-0066 shape, this repo's own ADR-0073; COEXISTS with the `docs/state.md`-specific `rotate-handover-sections.mjs` above rather than replacing it, per step 6d below):** run `node plugins/pipeline-core/scripts/handover-rotate.mjs --root "$PWD" --check-size --file <handover path>` as a machine-checked backstop to the manual size judgment above — it reports the file's current UTF-8 byte measurement against `handover.maxBytes` from calibration, or the actual default 30,000-byte cap, and exits non-zero when over, so "check the handover file's size" is a run command, not a guess. This check is READ-ONLY and makes no rotation decision by itself: an over-threshold result is a signal to perform the session-block rotation above (or, for a section old enough and already extraction-acknowledged per ADR-0060/ADR-0073, to run `node plugins/pipeline-core/scripts/handover-rotate.mjs --root "$PWD" --dry-run --section-heading "<exact heading>" --summary "<one-line archive summary>"` and review its bounded proposed archive plan before any actual move) — it never triggers an automatic rewrite of the handover file. A missing script (older plugin copy) is not a close blocker; fall back to the manual size judgment.

## 4. Step 6d: hard-cap rotation (ADR-0066)

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 167-172 -->
6d. **Hard-cap rotation (ADR-0066) — a SECOND, newer rotation mechanism, independent of 6c's session-block rotation** — mandatory check, same non-renumbering contract as 6b/6c. `plugins/pipeline-core/scripts/handover-rotate.mjs` (generalized, config-driven per project, ADR-0066 Decision 5) COEXISTS with 6c's `rotate-handover-sections.mjs` rather than replacing it as of this writing — reconciling the two into one mechanism is an open follow-up, not decided by this step:
   - Measure the handover file's current size against the configured hard cap (`plugins/pipeline-core/lib/handover-rotation.mjs`'s `resolveHandoverConfig()`; default `docs/state.md` / 30,000 utf8-byte-upper-bound bytes). Where this project's `hooks.json` has the `guard-handover-size.mjs` PreToolUse guard wired in, a growing write to the handover file already refuses once at/over the cap — this step is what actually clears that refusal, not merely a suggestion.
   - Whenever archiving the block just closed would keep the file comfortably under the cap, OR the file is already over/near the cap, run the rotation script against THIS block's own just-closed section before finishing the close. **Check status first, read-only:** `node plugins/pipeline-core/scripts/handover-rotate.mjs --root "$PWD" --status --section-heading "<exact heading of the block just closed>"` — this reports whether that exact section is acknowledged at its current content hash, with no side effect (it never writes the marker itself).
     - **Already acknowledged** (status reports RECORDED for the exact section heading at its current content hash): proceed with rotation as before — `node plugins/pipeline-core/scripts/handover-rotate.mjs --root "$PWD" --section-heading "<exact heading of the block just closed>" --summary "<one-line summary>"`.
     - **NOT yet acknowledged** (status reports NOT acknowledged for that exact section's current content): STOP — do not run `--acknowledge-extraction-done` as a routine part of this ritual, and do not rotate. Acknowledging it asserts that the one-time durable-rule extraction pass (ADR-0066 Decision 7) is genuinely complete for THIS section's current content; the acknowledgement must use `--acknowledge-extraction-done --section-heading "<exact heading>"` after that section-scoped review. This is a human/Elephant judgment call, never an automated step of routine closing. State this explicitly in the close output and leave the acknowledgment decision to a human/Elephant dispatch outside this ritual.
   - Report in the close output whether this step ran, and if so, which section moved to which `docs/state-archive/<ISO-date>--<slug>.md` file — a silent rotation is a lost trail, same rule as 6c.

## 5. Step 7: learn and measure

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 174-181 -->
7. **Learn + measure:**
   - **Self-retro:** the **session elephant writes the close retro itself** — concrete improvement item(s), or an explicit "nothing" — filed as a `workflow-improvement` backlog item (agent-pipeline repo's `backlog/items/`, or a transfer note in the handover per the mechanic below if that repo is absent on this machine), addressed to the pipeline elephant (continuous-improvement process). MANDATORY part of EVERY close, never silently skipped — silence is not an option (`docs/operating-model.md`, *The lifecycle* — step 8, Close). The PO submits his own observations separately, on his own channel; there is no ritual prompt to the PO anymore.
   - **Fan-out utilisation (FANOUT S11; runs only when a slice queue exists for the feature):** if the feature has a slice queue (`specs/<feature>/slice-queue.json`), run `node plugins/pipeline-core/scripts/slice-queue.mjs report --queue specs/<feature>/slice-queue.json` (add the ledger flags `--common-dir`, `--runner`, `--session` for the closing session so `ledger` is non-null; without them `ledger` is `null` and only the queue half is reported). Copy these output fields: `queue.feature`, `queue.size`, `queue.counts`, `queue.ready`, and from `ledger` (when non-null) `ledger.slotIdleMinutesWithReady`, `ledger.meanLiveOverTargetWhileReady`, `ledger.blocks`, `ledger.defied`, `ledger.declaredDefers`, `ledger.pauseMinutes`, `ledger.slicesLaunched`. Output goes to the handover session block (one summary line) and into the retro as input; keep the short machine-written result as `evidence/fanout-utilization-<date>.json`. Hash-only privacy: copy only those counters, never prompts, paths of private ledgers or session content. No slice queue → skipped silently with one "no slice queue" line; a failing or absent `report` is noted and never a blocker for the close.
   - **Tooling radar due? (tooling-policy R2 anchor):** compare the date of the newest `tooling-radar` backlog item in the agent-pipeline repo's `backlog/items/` with the current calendar month. If the newest radar item is older than the current calendar month (or none exists), the monthly radar run is OVERDUE: say so LOUDLY in the ritual output and recommend a radar dispatch (per `policies/tooling-policy.md` §4 R2–R4) — never pass over it silently. This check is the deterministic anchor of the R2 catch-up rule.
   - File `workflow-improvement` items in the agent-pipeline repo's `backlog/`; if that repo is not present on this machine, record the item verbatim in the handover for transfer.
   - Growth rule: any agent failure of this block traced to a missing/vague rule → add/sharpen the rule in the right artifact (CLAUDE.md fact, hook, skill) — and keep the length gate green.
   - Three-artifacts archive for rigor ≥ 1: (1) problem/spec, (2) acceptance criteria, (3) result report — versioned; full chat logs are NEVER archived. `AI-Assisted: true` is an anonymous assistance marker only; the dispatch record plus grounded `Dispatch:` trailer carry work-package provenance. Provider/model co-author metadata, session URLs/IDs, and account correlation are prohibited.
   - Rigor-0 lessons may be bundled into one collective entry (`docs/operating-model.md`, *Rigor, risk and gates*).

## 6. Step 8: telemetry line (MP-20)

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 184-195 -->
8. **Telemetry line (MP-20), auto-captured via `usage-ledger.mjs`:** `/usage` is a **user command and session-scoped** — numbers are NOT retrievable after the session ends, which is why the token half of this step now runs through `plugins/pipeline-core/scripts/usage-ledger.mjs` instead of a manual paste. New order of operations:

   1. **Run the ledger for the CURRENT session** with `--row <block label>`: prefer `--session <own-uuid>` when the session's own UUID is derivable from the environment; otherwise `--latest` (with a sanity check that the printed self-evidence — the chosen session/file — IS the running session before trusting the row). Transcripts root is the mandatory first CLI argument (GL-03, C-4) — invoke via the env-based standard path, never a machine-specific absolute path: `"$HOME/.claude/projects"` (POSIX) resp. `"%USERPROFILE%\.claude\projects"` (Windows), e.g. `node plugins/pipeline-core/scripts/usage-ledger.mjs "$HOME/.claude/projects" --latest --row "<block label>"`.
   On Antigravity and Codex the same script gives a token-only row (no dollar half) from a transcript path you pass: `usage-ledger.mjs --row "<block label>" --antigravity-transcript <file>` resp. `--codex-rollout <file>`.
   2. **Append the row** to the project's `telemetry/costs.md` (create the file with the header below if absent) — token half = **collected (script)**, $-half = **estimated** (marked with the `asOf` date of `plugins/pipeline-core/scripts/model-prices.json`); the advisor-model $ estimate is additionally called out on its own in "Notes" (the real-money share when a paid external model is configured). As before, **one row per session/block AND one row per goldfish dispatch** of this block.
   3. **`/usage` paste stays OPTIONAL**, asked once as before (EL-17c) — now framed as "Limits/reconciliation" (limit standings %, credit %), no longer the data source for the token column. Decline/absence is fine; the row still exists — this replaces "not collected" as the default outcome. "not collected" remains reserved for actual script failure (5. below).
   4. **Standing addendum rule:** a PO `/usage` paste arriving at ANY later time (any session of this repo) is worked into the NAMED session's existing row as a dated addendum — real numbers OVERRIDE the estimate, the estimate stays visible in parentheses (calibration data for the estimator, MP-21); accompanying PO comments land in "Notes".
   5. **Fail-open:** script failure (missing/unreadable transcripts root, malformed price file, etc.) → record "not collected (script error: <short>)" in the token column and continue the ritual — telemetry must never block a close.

   | Date | Session/Block | Role | Model/Effort | Task (short) | Tokens per `/usage` | First-Pass (y/n) | Interventions needed (y/n) | Notes |
   |---|---|---|---|---|---|---|---|---|

   Conventions (MP-20): Role ∈ {Elephant, Goldfish, Critic, Workflow}; First-Pass/Interventions are maintained per goldfish dispatch, Elephant/Critic rows carry "—"; "Notes" = escalations (MP-05/MP-07), advisor-model fallback / advisor-model $ share, cache anomalies, calibration runs, workflow agent count, addendum entries (see 4. above); headless/`--bare` runs add `total_cost_usd` (marked as $) in the token column. `/context` reading may be noted here too. **Long sessions:** append the telemetry row per completed dispatch wave DURING the session, not only at the close — close-anchored-only persistence loses `/usage` data irrecoverably on a crash.

## 7. Strict feature-branch delivery extension

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 201-201 -->
When the project calibration declares `publicPushIdentity.mode: required`, a successful close additionally requires this exact order: final commit → regenerate Full Verify and required privacy/security evidence for that commit → read back the calibrated SSH account with `ssh -T <sshHostAlias>` → push that exact OID to the approved explicit feature branch → fetch it into a fresh/disposable repository → compare fetched and source OIDs. The complete newly reachable range must pass the calibrated neutral Author/Committer, no-signature and no-private-metadata checks. A missing credential, account mismatch, push failure or fetch-back mismatch leaves the close **unfinished/blocked**; it is never a success claim. This extension does not authorize main, merge, tag, release, force-push or deletion.

## 8. Close-light variant: eligibility gate, ritual, skips

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 207-254 -->
This is a **checklist gate, never a judgment call**: ALL four boxes must hold, checked explicitly
before choosing this path over the full ritual above.

- [ ] **≤ 1 package/dispatch delivered** this block (the close act itself does not count).
- [ ] **No guardrail/canon diff:** no changes to `docs/operating-model.md`, `roles/*`, `policies/*`,
      any hook (`plugins/pipeline-core/hooks/*`), `.claude/settings.json`, the project's
      calibration at its resolved authority tier (`project/pipeline.json`/`pipeline.yaml`,
      else `.claude/pipeline.json`/`pipeline.yaml`), or any ADR.
- [ ] **Session wall-clock < ~1h** (bootstrap to this close).
- [ ] **No Critic finding ≥ major open/undisposed.**

**Even ONE unchecked box → run the FULL ritual (steps 0–11 above).** Never partially apply close-light
to a session that fails the gate — the gate is binary, not "mostly small."

**Close-light ritual (only when ALL four hold):**

1. **Verify:** run the calibration's `verify` command against the final state — the SAME evidence bar
   as full-ritual step 3 (machine-written output + exact command + exit code). This gate never
   compresses (the invariant is untouched by any profile).
2. **Authorship check:** the same mandatory question as full-ritual step 6b — "Whose are this session's
   production diffs?" — a single-package close still gets this; the incident class it
   guards against (Elephant-authored diff outside stage-0) is exactly as costly at 1 package as at 10.
3. **Telemetry line:** append the one row for this block to `telemetry/costs.md` via the usual ledger
   mechanism (full-ritual step 8, mechanics unchanged).
4. **Push:** per the project's push policy (unchanged).
5. **One-paragraph handover update:** a SINGLE paragraph appended to the handover file — current
   state, the one thing that changed, next step. Not a full step-5 rewrite, no separate HISTORY entry
   (folded into this paragraph). If something genuinely new was learned, one sentence naming it is
   still owed here (the silence-is-not-an-option rule applies even in light form) — just folded into this
   paragraph instead of a separate backlog item.
6. **Session-owned residue:** apply the same descriptor-bound cleanup and hygiene gate as the full ritual; close-light never weakens deletion or clean-repository assurance.

**What close-light deliberately SKIPS vs. the full ritual:** the full drift-check bundle (step 4:
formal CLAUDE.md length gate re-measure, memory-mirror pass, stale-worktree enumeration — spot-check
only if something looks obviously wrong, no formal report); the separate HISTORY append (folded into
the handover paragraph); a full self-retro backlog item (rigor-0 bundling per `docs/operating-model.md`, *Rigor, risk and gates*, already allows
this — close-light makes it the default, not the exception); the session-cut/`/context` recommendation
(a <1h session is not near a cut boundary by construction). The error-register update (step 7b) is
**still done IF a new/recurring class was actually observed** — close-light compresses ceremony, never
observation; if nothing register-worthy happened, it is skipped silently like any other block with
nothing to report. The handover-rotation step (6c) keeps its **register-discipline half in full**
(index row + archive-append for any new register entry, where the project's handover uses one — costs
nothing extra and is exactly what keeps the next session's bootstrap slim); only the
**session/block-rotation half is skipped by default** (a <1h close-light session's one-paragraph append
rarely crosses the ~25k-token threshold by itself) — do the cheap size check anyway and rotate if the
head is already over target.

**Anything outside the gate = full ritual. No partial/hybrid close.**
