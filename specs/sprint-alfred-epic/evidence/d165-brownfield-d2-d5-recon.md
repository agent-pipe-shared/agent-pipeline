# D165 recon: brownfield architecture gate D2-D5 and the Windows side findings

Read-only recon on HEAD `1e646910c` (2026-10-26) for backlog item `2026-10-26-brownfield-architecture-gate-never-passes`.
Paths are under `plugins/pipeline-core/`. Nothing was run; code paths and line numbers are the recon agent's reading and
are re-checked by the slice that touches them. D1 is fixed by the held patch `d165-d1-brownfield-entry`.

"Kernel" means listed in `NEVER_LIFTABLE_KERNEL_PATHS` (`lib/guard-maintenance-window.mjs`): all of `lib/guard/*`,
`hooks/guard-*`, `scripts/pipeline-state.mjs`, `scripts/pipeline-start-preflight.mjs`, `scripts/architecture-adoption.mjs`,
`scripts/architecture-fitness.mjs`, `lib/architecture-entry-readiness.mjs`, `lib/architecture-adoption-authority.mjs`,
`lib/session-authority-registry.mjs`. Kernel files change only as held patches applied by the PO as operator.

## D2: migration scope too narrow, class 9 stays unavailable (true)

- `scripts/architecture-adoption.mjs:262-279` and `lib/architecture-entry-readiness.mjs:327-337` pass the legacy scope
  unchanged to `prepare --scope`. `scripts/architecture-fitness.mjs:760-761` needs `architecture/map`,
  `project/pipeline.json` and `pipeline.user.yaml` inside the scope, otherwise class 9 is `unavailable`, and
  `projectPlanningFitness` (`lib/architecture-entry-readiness.mjs:195-198`) counts that as blocking
  (`ARCHITECTURE-FITNESS-NOT-READY`).
- Hand-written map versus measured baseline: the code does not distinguish them (`adoptionSnapshot` only hashes the
  files; `applyAdoptionDecision` sets `coverageClass: "evaluated"`, `confidence: "measured"` once the PO proof
  verifies). Readiness also needs `architecture/fitness-model.json` and `architecture/baseline.json`
  (`lib/architecture-entry-readiness.mjs:270-284`); only `scripts/architecture-measure.mjs --apply` writes them. The
  measure script is the intended route.
- Smallest fix: export `CLASS9_REQUIRED_SCOPE` from `lib/architecture-adoption-authority.mjs` and union it into the
  migration scope in `scripts/architecture-adoption.mjs` and into `prepareArgs` in `lib/architecture-entry-readiness.mjs`.
  The PO still signs the widened scope. Do not touch `lib/guard/entry-gates.mjs` (D1 patch).
- Tests: `scripts/architecture-adoption.test.mjs:671-691`, `lib/architecture-entry-readiness.test.mjs:166-178`,
  `lib/pins/brownfield-implementation-entry-demands-a-greenfield-design-block.test.mjs`, a class-9 case in
  `scripts/architecture-fitness.test.mjs`. All three source files are kernel: held patch.

## D3: preflight recommends a command the guard refuses (true)

- Preflight (`scripts/pipeline-start-preflight.mjs:1643-1655`) emits `architecture-adoption.mjs propose --root <cwd> --json`.
  The lifecycle shell lane (`lib/guard/devplan-shell-lane.mjs:48-128`) treats an unsanctioned `node <script>` as
  `opaque-script-execution` and refuses it in draft and approved (`GUARD-DEVPLAN-SHELL`). `sanctionedLifecycleScriptArgs`
  (`lib/guard/command-catalogue.mjs:308-349`) has no entry for `architecture-adoption.mjs`, `architecture-measure.mjs`
  or `architecture-fitness.mjs`; the same gap blocks `prepare`, `check`, `status` and the measure script.
- Smallest fix (K152 precedent): constants in `lib/guard/constants.mjs` and one `sanctionedArchitectureAdoptionArgs`
  in `command-catalogue.mjs` admitting `propose|status|check --root <root> [--json]`, `prepare` with its closed flag set
  (`--out` scratch only), `architecture-measure.mjs --root <root> [--apply]`, `architecture-fitness.mjs` read-only.
  `apply` is NOT admitted (it needs the PO proof and stays behind the ceremony).
- Tests: a pin modelled on `lib/pins/antigravity-design-phase-scripts-refused-in-draft.test.mjs`;
  `lib/guard/guard-split-contract.test.mjs` and `hooks/guard-lifecycle-ready.test.mjs` if they enumerate constants.
  Kernel: held patch.

## D4: hurdles surface after the PO signature (true)

- `submit-plan` (`scripts/pipeline-state.mjs:11253-11312`) checks only the greenfield design draft; `approve-plan`
  (line 11735) has no architecture check. `inspectArchitectureEntryReadiness` runs only once the lifecycle is `approved`
  (lines 4497-4508) and in `set-phase --phase implementation` (lines 11075-11089). Re-signing follows from
  `verifyAdoptionAuthority` with `requireCurrent` (`lib/architecture-adoption-authority.mjs:152`): any change to map,
  profile, routing or candidate after the adoption signature forces a new one.
- Needed order: (1) map, fitness model, baseline and `AGENTS.md` pointer written in draft (needs D3 and D5),
  (2) adoption prepare/sign/apply with nothing changing afterwards, (3) `submit-plan` with a brownfield pre-check,
  (4) `approve-plan`.
- Smallest fix: in `submit-plan`, before `writeState`, call `inspectArchitectureEntryReadiness` when no design package
  applies and refuse with zero State mutation for the brownfield codes (map missing/invalid, fitness model or baseline
  invalid, adoption disposition or migration required, `AGENTS.md` pointer, checkpoint debt, fitness not ready); skip the
  greenfield-only codes. Not traced: the trust-anchor remark. Tests: `scripts/pipeline-state.test.mjs` (seam
  `deps.architectureEntryReadiness`), `pipeline-state-inspect.test.mjs`, `push-init.test.mjs`. Kernel: held patch,
  depends on D2, D3, D5 for a usable next action.

## D5: no write route for `architecture/` and `AGENTS.md` (partly true)

- Not "any phase": the Edit/Write hook `hooks/guard-devplan.mjs` (lines 325, 537-541) has its own exempt list
  (`docs/`, `specs/`, `.claude/`, `backlog/`) and refuses `architecture/`, `AGENTS.md`, `pipeline.user.yaml` before
  implementation; `lib/guard-devplan-policy.mjs:340-341, 528-536` (AC-207 `ONBOARDING_SCAFFOLD_*`) already exempts them
  for the shell lane and the staged-commit check. The two lanes disagree, and entering implementation needs the map
  already. `architecture-measure.mjs` is refused too (D3) and never writes `AGENTS.md`.
- Smallest fix: export `isOnboardingScaffoldPath` from `lib/guard-devplan-policy.mjs` and use it in
  `hooks/guard-devplan.mjs` (parity with the existing lanes, no new authority); D3 admits the measure route. A narrower
  variant (map, fitness model, baseline, `AGENTS.md` only) changes the AC-207 pin.
- Tests: `hooks/guard-devplan.test.mjs`, `lib/pins/lifecycle-coordination-commands-refused-as-implementation-writes.test.mjs:112-132`.
  Kernel/rigor-protected: held patch.

## Windows side findings

- **W1 swallowed input line** (plausible, not reproduced): `scripts/bootstrap-trust-recovery.mjs:147-153` uses
  `readline/promises` and closes it; a pasted second line stays in readline's buffer and is dropped. Fix: the byte-wise
  `readSync` reader of `scripts/po-human-approval.mjs:1622-1637`. Not kernel; trust-anchor ceremony, so Critic first.
  Test `scripts/bootstrap-trust-recovery.test.mjs:66-67` needs an injectable line reader.
- **W2 release-lock EPERM fsync**: mostly fixed at HEAD by the held patch `r2-windows-session-locks`
  (`lib/session-authority-registry.mjs:257-274, 312-329`). Remaining: `scripts/session-authority-repair.mjs:288-292`
  exits 0 on a `retained` result; fix `released.status === "retained" ? 2 : 0`. Not kernel. Test
  `scripts/session-authority-repair.test.mjs` (SAR12, SAR13).
- **W3 Ctrl+C leaves a lock**: true in code, low severity. No signal handlers; the continuity lock
  (`scripts/pipeline-state.mjs:1357`) self-heals after `CONTINUITY_LOCK_STALE_MS = 30_000`. No fix now; accepted
  behaviour or a later kernel batch.

## Slicing

| Slice | Content | Files | Route |
|---|---|---|---|
| S1 | D3 command admission plus the map route of D5 | `lib/guard/constants.mjs`, `lib/guard/command-catalogue.mjs` | held patch (kernel) |
| S2 | D5 Edit/Write parity | `hooks/guard-devplan.mjs`, `lib/guard-devplan-policy.mjs` | held patch (kernel) |
| S3 | D2 scope union | `lib/architecture-adoption-authority.mjs`, `scripts/architecture-adoption.mjs`, `lib/architecture-entry-readiness.mjs` | held patch (kernel); stacks on D1 |
| S4 | D4 submit-plan pre-check | `scripts/pipeline-state.mjs` | held patch (kernel); after S1 to S3 |
| S5 | W1 and the W2 exit code | `scripts/bootstrap-trust-recovery.mjs`, `scripts/session-authority-repair.mjs` and tests | clone patch |
