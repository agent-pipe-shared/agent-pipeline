# Critic review: bootstrap origin-allowlist / Codex-WSL freshness design (commit `a75a45d`)

**Reviewer:** pipeline-core:critic, functional-equivalent-read-only lane, requested route claude-opus-5 at max.
**Reviewed object:** `specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md`, commit `a75a45d`.
**Verdict: FAIL — 1 BLOCKER + 4 MAJOR + 3 MINOR.**

## Findings

1. **BLOCKER — §A.5/§A.6's "soft/advisory, never a new bootstrap failure" ignores `nextAction: null`.**
   The chosen `"plugin-refresh-required"` status branch sets `nextAction: null`
   (`pipeline-start-preflight.mjs:225`). `pipeline-start/SKILL.md:24,59-61`
   requires bootstrap step 1 to execute the `nextAction` returned by preflight
   ("when ready"); step 4 (`SKILL.md:80-83`) forbids printing the mandatory
   confirmation line on non-ready state. `"plugin-refresh-required"` has no
   documented recovery path in `references/onboarding-recovery.md` (grep: no
   match). Every session that trips this new attestation therefore has no
   `nextAction` to execute and no printable confirmation — not the "soft
   advisory" the design promises the PO in §A.6.

2. **MAJOR — §B.3's "closed family" covers only 4 of the 8 git invocations flowing through the `options.spawn` seam §B.2(b) selects.**
   `ruleset-freshness.mjs`'s network-touching calls include 4 more invocations
   (`:84,:236,:255,:263`) not in the proposed 5-member family. Either the
   substitute rejects them (silently degrading the "repair" to a
   version-string-only comparison, contradicting §B.7's "strict improvement"
   claim) or it passes unrecognised commands through to plain `spawnSync` — a
   direct-execution fallback the threat model explicitly forbids
   (`docs/phoenix-governance-threat-model.md:31`).

3. **MAJOR — §B.4's "currently inert (nothing consumes it)" is false, and a closed backlog item already recorded the live effect.**
   `executionBoundary: "host-authorized-wsl"` is consumed as a mandatory host
   execution profile by `pipeline-start/SKILL.md:71-76`.
   `backlog/items/2026-08-05-pipeline-state-rebind-codex-default-runner.md`
   (status `closed`, `closed_at: 2026-08-06`) already recorded this exact
   defect. §B.7's "zero behavioral change for every other runner/host
   combination" is also falsified by the design's own §B.2(a) fix (Claude
   Code under WSL loses the mandatory-boundary routing it has today — a
   desirable change, but a change). The supporting "repo-wide grep... sole
   mechanism anywhere in the tree" claim was actually scoped to `plugins/`
   only (per the design's own Verification log), which is what hid this prior
   art.

4. **MAJOR — §A.1 states a guarantee Part A's mechanism cannot deliver.**
   §A.1 claims the check proves plugin code is "byte-identical to a clean
   checkout" of an allowlisted origin. Part A performs no remote read
   anywhere — `observeGit` only checks local `rev-parse`/`remote get-url
   origin`/`status --porcelain`. The property actually delivered is "origin
   URL allowlisted AND no *uncommitted* modification" — a clone carrying
   arbitrary *committed* local changes satisfies both. §A.4 compounds this by
   listing "content-hash match" as part of "the real guarantee" while
   correctly noting elsewhere that the comparison is tautological in the
   self-referential call shape.

5. **MAJOR — the new allowlist constant is an unprotected gate-strength surface, and §A.7 scopes out the only change that would protect it.**
   `guard-gate-strength.mjs`'s `GATE_STRENGTH_PATHS` (GS-1..GS-5,GS-7) does
   not cover `pipeline-start-preflight.mjs` or any new constant module; GS-6
   covers only the *installed* live plugin root, not the source tree. §A.5's
   failure-mode taxonomy has no "allowlist constant was edited" case, and
   §A.7 explicitly scopes out "any change to... guardrail/config surface" —
   the exact change that would close this gap. An agent in a self-application
   session could weaken the new bootstrap gate by editing its own two-URL
   constant, with no PreToolUse refusal, and this is not even documented as a
   known risk (QG-06).

6. **MINOR — §B.6's required-doc-update list omits the threat-model row §B.3 relies on.**
   §B.3 justifies the widening by citing the threat model's "one network-open,
   read-only host action" property (`docs/phoenix-governance-threat-model.md:15`);
   §B.6 flags two doc updates but not this one, which the design itself
   falsifies.

7. **MINOR — design-phase authorship ran below the mandated tier, undocumented.**
   Dispatch record shows `model: claude-sonnet-5` for a design-latitude
   artifact; `policies/model-policy.md` MP-23 mandates the Design-tier model
   for design-phase work, with no rationale recorded anywhere for the
   deviation.

8. **MINOR — one §B.5 citation doesn't support its attached claim.**
   `harness/session-bootstrap.md:154` (cited alongside `:162,:167`) is inside
   an unrelated private-overlay bullet, not an advisory/fail-open statement.

## Deliberately not flagged (genuinely cleared)

PO-decision fidelity for both parts (no revival of retired API surface; Codex+WSL
scoping has no residual path — independently verified via the Codex hooks wiring,
`.codex-plugin/plugin.json` → `codex-hooks.json`, confirming Codex doesn't wire the
SessionStart hook that's the design's only other `inspectPipelineUpdateAvailability`
caller). Citation accuracy — all spot-checked load-bearing anchors exact (both
current-main and pre-merge `998a609`). Name-collision concern genuinely resolved.
`normalizeRulesetSource` zero-production-callers self-correction is honest, not
smoothed over. §A.4/§A.6 genuinely open, not silently pre-answered. §B.8's schema
deferral defensible in itself (F2 is about the endorsed shape's incompleteness, not
the fact of deferral). Dependency/language checks: n/a / correct.

## Trajectory check

**Consistent.** All of the design's own Verification-log commands were re-run and
reproduce exactly (byte-identical `diff`, matching import-error text, matching
CLAUDECODE file enumeration). The one trajectory-relevant issue is internal, not
fabricated: §B.4 claims a "repo-wide... anywhere in the tree" grep while the
Verification log records it as `plugins/`-scoped — that widening is what hid the
F3 prior art.

## Briefing violations

None blocking. Two disclosures: (a) both backlog items now carry post-hoc "Design
phase" summary paragraphs of the reviewed design — read incidentally while
following the dispatch's Triage-section pointer, not used as input; flagged as a
future contamination-vector risk for first-pass Critic dispatches reading spec
files that accumulate implementor summaries. (b) two incidental `docs/state.md`
grep hits, not opened/used. One self-inflicted scratchpad-isolation deviation
(one temp file written to scratchpad root instead of a fresh subdirectory,
disclosed, no repository mutation).

## Disposition

Well-researched, honest verification log, better-than-average citation
discipline — but two central risk assertions given to the PO as the basis for
§A.6/§B.3/§B.8's open questions do not survive checking (the "soft" branch isn't
soft; "zero behavioral change" is false and the covered action family is
incomplete), Part A overstates its own guarantee, and the new gate-deciding
constant is left unprotected while the fix that would protect it is scoped out.
Next: a rework dispatch addressing all 8 findings (F1 blocker first), then a
bounded delta Critic re-review before implementation — same sequence as WP5.
