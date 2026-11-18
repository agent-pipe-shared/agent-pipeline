# w312 (C31-B2) — onboarding seeds a README.md and a backlog skeleton, admits README.md as a scaffold path, and the ADR hint names create-adr (candidate 31, lanes L5 and L4 stage 4)

Order: this patch is a delta on the base clone of candidate 31 (the held base patch of that candidate). It does NOT apply to the real checkout until that base patch is applied first; `git apply --check` against the real HEAD is expected to fail until then. Plugin source is protected in the real checkout: the PO applies it as human operator. The PRD and the Spec are unchanged; the criterion binding AC-112 is the closest existing accepted criterion.

## What it adds

- `lib/architecture-map-scaffold.mjs`: a pure `initialGreenfieldProjectDocTargets(classification)` next to the D80 seed. For `fresh` and `fresh-host-managed` it returns two static targets, `README.md` (front door skeleton with "How to start", "How to test", pointers) and `backlog/README.md` (one file per item under `backlog/items/`, minimal frontmatter, status words `open` / `in_progress` / `closed`, never delete, no ledger); `[]` otherwise. No project name, no placeholder token, no stored status.
- `lib/project-onboarding-v3.mjs` (`planProjectOnboardingV3`): the two targets join the plan with their own kinds (`project-readme`, `project-backlog`). They are conditional so the scaffold can never cause a write refusal or roll the onboarding back: README is skipped when ANY root entry matches `/^readme(\..*)?$/i`, the backlog file when a root entry `backlog` exists, both case-insensitively. A non-greenfield `existing-unmanaged` root gets neither.
- `lib/guard-devplan-policy.mjs`: ONE entry, `README.md`, in `ONBOARDING_SCAFFOLD_EXACT_PATHS`. The single predicate `isOnboardingScaffoldPath` serves the Edit/Write hook, the shell lane and the staged-commit check, so all three admit exactly the root file (`sub/README.md` and `README.md.bak` stay refused). `backlog/` is already an exempt prefix; nothing else is admitted.
- `AGENTS.md` seed: one sentence naming `README.md` and `backlog/README.md`.
- ADR README seed (L4 stage 4, same file): says an ADR draft is created with `create-adr.mjs --root <project root> --slug <slug> --title "<title>"` and bound by `bind-adr-proposals.mjs`; every other sentence kept.

## Test-first (QG-04 restated pins named)

New cases were written and shown RED before any production edit: the scaffold, onboarding and onboarding-seed cases failed at import (`initialGreenfieldProjectDocTargets` not exported), the policy case failed with `PIPELINE-STAGED-LIFECYCLE-BLOCKED` / `GUARD-DEVPLAN-LIFECYCLE` for `README.md`, the hook test failed on Edit/Write `README.md` in draft, draft-authority, awaiting-approval and approved plus the predicate row.
Restated pins (they fixed the old behaviour): `hooks/guard-devplan.test.mjs` row `["README.md", false]` is now `true` (with `sub/README.md` and `README.md.bak` added as `false`, and README.md added to the Edit/Write scaffold list); the three pinned onboarding target lists in `project-onboarding-v3.test.mjs` now carry `backlog/README.md` and `README.md`; the D80 hint test gained the `create-adr.mjs` / `bind-adr-proposals` assertions.
New onboarding cases run inside the existing callback "an existing unmanaged project receives an additive adoption plan" because the suite's closed partition (`EXPECTED_CASE_COUNT`) fixes the callback count: every plan target passes `isOnboardingScaffoldPath` or an exempt prefix (the structural guard that would have caught the `VERSION` refusal), seeds applied create-only with their kinds, a pre-existing `Readme.md` / `readme` / `README.rst` / `README` or `backlog` / `Backlog` gets no seed and onboarding still applies with the user's bytes intact, a `package.json` root gets neither seed.

## Not changed / not proven

- No gate, signature, approval, record shape, digest or stored status changes. Existing onboarded projects gain the README admission only, no backfill seed (recon decision D4).
- `lib/pipeline-owned-files.mjs`, the not-ready lane (PORG-INVALID-OBSERVATION) and uninstall are untouched. Stage 4's reference sentences (`happy-path.md`, SKILL.md) are not part of this patch.
- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: this change is verified by tests only (the targeted suites named in the dispatch report). Not exercised: a live greenfield run, other runners' lanes beyond the shared `devPlanGateVerdict`.
