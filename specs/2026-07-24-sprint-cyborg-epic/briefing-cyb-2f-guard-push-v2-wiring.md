# Briefing — CYB-2F: `guard-push.mjs` v2 completeness wiring (Wave 5, final)

> Dispatch briefing for one `goldfish-deep` (effort xhigh) task. Fresh context.
> Deliver a diff + condensed evidence-backed report, or a clean stop.

## Field 0 — Dispatch metadata

- **Sub-package:** CYB-2F (Sprint Cyborg epic, `cyb-2-body-slicing.md` §1 row
  6, Wave 5 — **last** wave of CYB-2, serialize, isolated). Depends on CYB-2C
  (plan-builder) + CYB-2E (v2 integration), both CLOSED.
- **Candidate base:** `feat/sprint-cyborg-claude` @ HEAD (confirm via `git log
  -1 --format=%H` at dispatch time — this branch has moved since CYB-2E;
  expect the two gitleaks fixture/scope fixes, `c268983`/`bab3425`/`12c7943`,
  already in history). Working tree must be clean before you start; keep it
  clean; end with exactly one atomic commit.
- **Model / effort:** `goldfish-deep` / opus / **xhigh** — justified:
  `guard-push.mjs` is explicitly flagged in the body-slicing plan as "Highest-
  risk file in the whole package (1277 lines, push-gating-critical)"; this
  edit has genuine in-task design latitude (the v2-verdict binding/staleness
  proof below has no existing precedent in this file to copy) and requires
  full regression authorship.
- **Profile:** epic, execution phase.
- **PO design decision (2026-07-29, recorded `docs/state.md`):** the v2
  completeness check is **ADDITIVE**, not a replacement. `guard-push.mjs`
  MUST continue to block on every existing v1 condition it blocks on today
  (staleness, dirty/mismatched candidate, severity-based `hasBlockingFinding`
  — none of that logic lives in this file, it's already baked into whether
  `evidence/security-latest.json`'s `exitCode` is 0, which this file already
  checks). This wave ADDS a new, independent failure mode: the v2
  policy-complete verdict (`evidence/security-latest.v2.verdict.json`) being
  `blocking:true`. **Do not implement "replace v1 authority with v2" — that
  was explicitly declined** because v2's `aggregateVerdict` treats a
  capability's `findings` outcome as *accepted* (it is a completeness check,
  "did every required capability run to some accepted state", not a severity
  check) — replacing v1 wholesale would silently stop blocking on real
  high/critical-severity secret findings. Both authorities apply; either one
  blocking is enough to block the push.

## Field 1 — Goal

Add ONE new independent check to `guard-push.mjs`, evaluated under the exact
same trigger condition as the existing security-evidence check
(`securityGate = gateConfig(manifest, "security"); if (securityGate &&
securityGate.mode !== "off")`, ~line 1242-1245): consult
`evidence/security-latest.v2.json` (the v2 envelope — has `input.commit`/
`input.tree` for candidate binding, same shape as CYB-2E produced) and
`evidence/security-latest.v2.verdict.json` (the v2 policy-complete verdict —
schema `pipeline.security-verdict.v2`, has `verdict.blocking` +
`verdict.offendingCapabilities`, written by the SAME `security-scan.mjs` run
as its companion envelope, see `harness/scripts/security-scan.mjs` lines
~805-809 read-only). If `verdict.blocking === true`, push it into the SAME
`failures` array the existing checks already push into (~line 1236 `const
failures = []`) — one human-readable failure line per offending capability
(mirror the existing failure-message style, e.g. `` `evidence/security-latest.v2.verdict.json: required capability ${capabilityId} did not reach an accepted state (outcome=${outcome})` ``)
— so it surfaces in the SAME combined stderr block (~line 1293-1299) as every
other Push-Gate finding, with no separate code path, message format, or exit
semantics of its own. The existing `if (failures.length === 0) process.exit(0)`
/ mode-warn-vs-blocking exit logic (~line 1291, 1301-1302) is UNCHANGED and
now simply also sees these new entries when applicable.

**The core design problem you must solve (this is the in-task latitude):**
`security-latest.v2.verdict.json` has NO `commit`/`tree` field of its own —
only its companion envelope (`security-latest.v2.json`) does, via `input.commit`/
`input.tree`. Both files are written together, back-to-back, by the same
`security-scan.mjs` invocation (lines ~808-809) — but nothing on disk
*proves* a given verdict.json was produced in the same run as the envelope.json
sitting next to it (e.g., a crashed/partial rewrite could theoretically leave
a stale verdict.json next to a freshly-rewritten envelope.json, or vice
versa). You must design a binding check that:
1. Confirms the envelope (`security-latest.v2.json`) is itself bound to the
   pushed source: `input.commit === sourceCommit` AND `input.tree ===
   sourceTree` (mirror the existing `checkSecurityEvidenceBinding`'s v1
   pattern exactly — same `sourceCommit`/`sourceTree` variables already
   computed in this file, do not recompute via a second `git rev-parse`).
2. Confirms the verdict.json is the SAME run's output as that envelope — you
   choose the concrete mechanism (e.g., cross-check that
   `verdict.json.capabilityOutcomes` is exactly consistent with
   `envelope.json.capabilities[].status`/`.classification` per
   `capabilityId`, since both are independent derivations from the same
   underlying scan; or another provably-sound linkage). State your chosen
   mechanism and why it actually catches a staleness/mismatch case, not just
   a schema-shape case.
3. Any binding failure (envelope missing/stale/mismatched, verdict.json
   missing/malformed/schema-wrong, OR the cross-consistency check failing) is
   itself a Push-Gate failure line (fail-closed — same philosophy as every
   other check in this file), distinct from a `verdict.blocking:true` failure
   so an operator can tell "the v2 evidence itself is untrustworthy" apart
   from "the v2 evidence is trustworthy and says something is incomplete".
4. When the v2 envelope/verdict pair is absent entirely (e.g., an older
   `security-scan.mjs` invocation that never emitted v2, or the files were
   never generated) — since v2 emission is unconditional whenever
   `security-scan.mjs` runs at all on this branch post-CYB-2E (not
   manifest-gated), and the security gate is already confirmed active at this
   point in the file (same guard clause as the v1 check) — treat this the
   same as the v1 check treats a missing `security-latest.json`: a Push-Gate
   failure (`missing`), never a silent skip. This mirrors this file's
   existing "never silent-block, never silent-pass" doctrine (see header
   comment EXIT SEMANTICS). If you find a documented reason this default is
   wrong (e.g. a repo-level opt-out flag already exists elsewhere in this
   manifest/gate schema that should suppress the v2 check specifically),
   STOP and report it rather than inventing a new manifest key.

## Field 2 — Context files (read first)

- `plugins/pipeline-core/hooks/guard-push.mjs` — the ONLY production file you
  edit. Study the full header comment (EXIT SEMANTICS, ORDER OF EVALUATION),
  `checkEvidenceFreshness` (~1176), `checkSecurityEvidenceBinding` (~1205,
  your new function sits alongside this one, same file region, do NOT modify
  `checkSecurityEvidenceBinding` itself — it stays the v1-only check), the
  `failures` assembly block (~1236-1289), and the final exit block
  (~1291-1302).
- `harness/scripts/security-scan.mjs` — READ ONLY, do not edit. Study
  `buildSecurityEvidenceV2` (~551) and the write block (~796-810) to confirm
  exactly what `security-latest.v2.json` and `security-latest.v2.verdict.json`
  contain and how they're produced together.
- `plugins/pipeline-core/lib/security-evidence-evaluator.mjs` — READ ONLY, do
  not edit. `aggregateVerdict` (~632), `RUN_OUTCOMES`/`ACCEPTED_AGGREGATE_OUTCOMES`
  (~514-530) — confirms `findings` is an accepted (non-blocking) v2 outcome,
  the exact reason v2 must stay additive, not a v1 replacement.
- `evidence/security-latest.v2.json` and `evidence/security-latest.v2.verdict.json`
  in THIS repo (already on disk from this session's real runs) — read as a
  live example of the exact shape to parse, but your new checks must not
  assume any specific run's content, only the schema/field shapes.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2-feature-spec.md` — AC1 (green
  blocking verdict proves all required capabilities reached accepted states)
  and AC8 (Push/PR/Close/Release consume the SAME completeness evaluator —
  your new code must call the existing exported `evaluateAllCapabilities`/
  `aggregateVerdict`-family functions if you need to recompute anything, or
  simply trust the persisted `verdict.json` if your binding check (Field 1
  item 2) is sound enough not to need recomputation — your choice, justify
  briefly; either is AC8-compliant since no parallel duplicate evaluator is
  written, but recomputation from the envelope would be the more literal AC8
  reading if the binding-proof otherwise feels weak).
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2-body-slicing.md` §1 CYB-2F row,
  §2 wave order (Wave 5, last).
- `plugins/pipeline-core/hooks/guard-push.test.mjs` — existing regression
  suite. Study `freshRepo`, `writeEvidence`, `exactSecurityEvidence` (~26-77)
  — the exact hermetic fixture pattern you extend for v2. You will need an
  analogous `exactV2Envelope({ head, tree })` / `exactV2Verdict({ blocking,
  offendingCapabilities })`-style helper (naming your choice) that produces
  schema-valid, binding-consistent fixtures, plus deliberately-broken variants
  for your negative cases.

## Field 3 — Definition of Done (checks)

1. New v2-consult logic added to `guard-push.mjs`, triggered under the exact
   same `securityGate.mode !== "off"` condition as the existing v1 security
   check, appending to the same `failures` array, with no new exit-code path
   or message format outside the existing combined-message block.
2. Binding check (Field 1 items 1-3) implemented and justified in your report:
   what exactly proves the verdict.json is fresh AND belongs to the same run
   as a candidate-bound envelope.json.
3. Missing-v2-evidence default (Field 1 item 4) implemented as fail-closed,
   OR a documented STOP if you find a reason it shouldn't be (see Field 5).
4. `verdict.blocking === true` in a fresh, bound verdict.json produces exactly
   one failure line per `offendingCapabilities` entry, using the ID and
   outcome from that entry.
5. **Backward-compatibility proof (mandatory, this is the highest-risk part):**
   a test demonstrates that for a fresh, bound, `verdict.blocking:false` v2
   pair, the exit code and failure set are byte-identical to the pre-CYB-2F
   behavior (i.e., v2 truly adds nothing when it has nothing to add). A
   second test demonstrates a fresh, bound v1 evidence set that ALREADY fails
   today (e.g. stale/dirty candidate, per existing test cases) continues to
   fail with the SAME v1 failure messages regardless of what the v2 pair says
   (v2 never suppresses or replaces a v1 failure).
6. New tests (extend `guard-push.test.mjs` or add a sibling file — your
   choice, justify) covering: (a) fresh+bound+non-blocking v2 → no new
   failure (DoD 5's first test); (b) fresh+bound+blocking v2 → the expected
   failure line(s) appear, push still allowed through if... no, wait: blocking
   v2 must actually block the push (mode "blocking" → exit 2); confirm this;
   (c) v2 envelope/verdict missing entirely → fail-closed failure line, per
   your Field 1 item 4 default; (d) v2 envelope present but bound to a
   DIFFERENT commit/tree than the pushed source → binding failure, NOT
   silently ignored; (e) v2 verdict.json present but inconsistent with its
   companion envelope per your chosen cross-consistency mechanism (Field 1
   item 2) → binding failure, proving your staleness detection actually
   detects something, not just schema validity; (f) security gate `mode:
   "off"` (or gate absent) → v2 is not consulted at all, matching existing
   v1 skip behavior (mirror the existing off-mode test case).
7. `node plugins/pipeline-core/hooks/guard-push.test.mjs` — **mandatory full
   regression** per the body-slicing plan's own instruction for this file.
   Confirm via a `git stash`-verified before/after case count; zero new
   failures beyond your intentional new cases; report both counts.
8. Report includes: the exact binding-proof mechanism chosen + why it's sound,
   the missing-evidence default + rationale, the new/changed failure-message
   text, the before/after regression counts, and any deliberately unfixed
   observation (e.g. note if you find AC8's "Push/PR/Close/Release" other
   three call sites still don't exist yet — that's CYB-2I's separately-flagged
   open item, not yours to resolve here).

(Full aggregate `node harness/scripts/verify.mjs` + independent Critic + PO
gate are the Elephant's post-dispatch responsibility, not yours.)

## Field 4 — Prohibitions

- MUST NOT change `checkSecurityEvidenceBinding`, `checkEvidenceFreshness`, or
  any existing v1 check's behavior, message text, or trigger condition. Your
  new logic is purely additive alongside them.
- MUST NOT implement "v2 replaces v1" in any form — see Field 0's PO decision.
  If your binding design somehow makes this ambiguous, STOP and report rather
  than guessing which reading is intended.
- MUST NOT edit `security-scan.mjs`, `security-evidence-evaluator.mjs`,
  `security-capability-plan-builder.mjs`, `security-policy-resolver.mjs`, any
  `security-adapters/*.mjs`, `guardrails/security.md`, or
  `governance/security-controls/catalog.json`. Import/read only if you choose
  the "recompute from envelope via `evaluateAllCapabilities`/`aggregateVerdict`"
  design (Field 2's AC8 note) — importing their exported functions is fine,
  editing them is not.
- MUST NOT invent a new manifest schema key or `.claude/pipeline.yaml` gate
  field. If the missing-evidence default (Field 1 item 4) seems to need one,
  STOP and report instead (see Field 5).
- MUST NOT touch `.claude/pipeline-state.json` or `pipeline.user.yaml`.
- No new runtime dependencies.
- Commit trailers: `AI-Assisted: true` and a `Dispatch:` line; NO
  `Co-Authored-By` / `Claude-Session` trailers (GIT-03). Do not push. One
  atomic commit.
- Do not weaken, skip, or platform-gate away a genuine test failure to make
  things green.

## Field 5 — Stop conditions (return to Elephant, clean, no partial commit)

- You cannot design a binding/staleness proof for the verdict.json that
  actually catches a mismatch case (Field 1 item 2) without either recomputing
  the full verdict from the envelope (fine, allowed) or inventing a new
  persisted field in a prohibited file (not allowed) → STOP and report the
  exact gap.
- The missing-v2-evidence fail-closed default (Field 1 item 4) appears to
  actively break a legitimate, currently-passing scenario you can point to
  concretely (not hypothetical) → STOP and report it; this would be a
  PO-level default-policy question, not yours to silently resolve either way.
- The existing `guard-push.test.mjs` baseline cannot be reproduced (failures
  beyond a clean green) before you change anything → STOP (environment
  problem, not your diff).
- Implementing this cleanly would require touching any prohibited file → STOP
  and report exactly which file and why.

## Field 6 — Evidence to return

Diff (or clean-stop reason) + a condensed report covering DoD 1-8: the exact
binding-proof mechanism and why it's sound, the missing-evidence default
rationale, new failure-message text, the `git stash`-verified before/after
regression counts, and any deliberately unfixed observation.
