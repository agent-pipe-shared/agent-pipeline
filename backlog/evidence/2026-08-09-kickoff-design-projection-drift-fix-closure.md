# Closure evidence: `kickoff-design.md` names the wrong repair for `projection-drift`

- **Fix commit:** `e30205e2b6e31377daeeac719fd400f28fc819d4` (GF-068, goldfish;
  `plugins/pipeline-core/skills/pipeline-start/references/kickoff-design.md`,
  +13/-6 lines).
- **What changed:** the doc previously claimed a `PO-GATE-PRD-LANGUAGE-MISMATCH`
  and a `projection-drift` refusal "share the same repair path" (re-running
  `po-gate-profile-repair.mjs plan/apply --human-facing <de|en>`). Corrected to
  state they are different failure classes with different repair tools, and
  names the working pair for `projection-drift`:
  `project-onboarding-v3.mjs plan-repair` → `apply-repair --plan-sha256 <sha256>
  --activate`.
- **Independent verification (Elephant):** read `git show e30205e2b6e31377...`
  directly; confirmed the corrected text names the exact argv shape
  (`plan-repair --root <project-root> --intent <onboarding|bootstrap|session|
  dispatch> [--runner claude|codex]`, then `apply-repair`) that
  `project-onboarding-v3.mjs`'s own usage string and dispatch cases implement
  (grep-confirmed: usage string, `plan-repair`/`apply-repair` dispatch cases
  routing to `planProjectOnboardingLifecycleV4({..., operation: "repair", ...})`).
- **Why this matters, restated from the item:** in the observed session, the
  old (wrong) guidance caused a full wasted repair round-trip — a `plan`/`apply`
  cycle that reported its own no-op (`{"from":"de","to":"de"}`) followed by a
  re-`inspect` still showing `projection-drift`, before the agent discovered
  the correct tool pair independently of the doc. This fix removes that
  specific class of wasted round-trip going forward.
- No Critic review dispatched for this fix: pure documentation correction
  (no code/guardrail/security surface touched), self-verified by direct
  `git show` reading against the doc's own now-corrected text and the
  `project-onboarding-v3.mjs` code it describes.
