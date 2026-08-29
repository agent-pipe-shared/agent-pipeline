---
schema: pipeline.backlog-item.v1
id: pipeline.a-dirty-claude-directory-blocks-verify-which-blocks-push-approval
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: manual
source: "Antigravity/WSL self-analysis (docs/pipeline-analysis.md, section 2), observed during the 2026-08-29 three-runner greenfield test."
---

# A dirty git tree (unversioned .claude/) blocks verify, which blocks push approval

## What happened

Antigravity's report (section 2) records that an unversioned `.claude/`
directory left the working tree dirty in a way that blocked the mandatory
verify step, which in turn blocked push approval — several manual
interactions were needed to get back to a clean, verifiable state. A fresh
greenfield project's `.claude/` directory (session state, calibration files,
worktree scratch) is exactly the kind of thing that legitimately accumulates
during normal onboarding and should not, by itself, be treated the same as a
dirty tree carrying uncommitted source changes.

## Where it is

I searched for a `.gitignore` entry and a verify-time git-cleanliness check in
this repository within this dispatch's tool budget, but did NOT locate, with
confidence, the specific project-template `.gitignore` (or its absence) and
the specific verify-gate check that treats an untracked `.claude/` path as
tree-dirtying, for the GREENFIELD project template Antigravity was onboarded
into (a separate, consumer-project repository, not this Pipeline repository
itself — the greenfield project's own `.gitignore` is not part of this
repository and was not available to inspect in this dispatch). What this
Pipeline repository's OWN template/scaffolding provides to a newly onboarded
project for `.claude/` ignore rules, and whether that scaffolding was actually
applied in the audited run, is the open question a future session needs to
answer with the actual project template in hand.

## Proposal

1. Confirm whether this Pipeline's project-onboarding scaffolding (whatever
   generates a fresh project's initial `.gitignore`) includes `.claude/` (or
   the specific paths under it that are legitimately untracked, e.g. session
   worktrees, local calibration overrides) by default.
2. If it does not, add it — the same way `scratch/` is already exempted from
   several other guards' scope (per `templates/prompts/agent-obligations.md`
   §3), an onboarding-generated `.claude/` subtree of purely local/session
   state should not need a human to manually clean the tree before the FIRST
   verify run of a brand-new project.
3. If the scaffolding already does ignore it correctly and the audited run's
   dirtiness came from something else (a file genuinely written outside the
   ignored subpaths), name that specific file/path instead.

## Acceptance

- A controlled reproduction: run this Pipeline's actual greenfield onboarding
  flow into a scratch project, inspect the resulting `.gitignore` (or
  equivalent) for `.claude/` coverage, and run verify immediately after
  onboarding completes with no other manual changes — assert it does not fail
  on tree-dirtiness from `.claude/`.
- If a gap is found, the fix is a scaffolding/template change (not a guard
  weakening) verified by the same repro passing afterward.
- The verify gate's OWN cleanliness check (wherever it lives) is named with a
  file/line reference once located — this item's "Where it is" section is
  updated from its current honest "could not locate within budget" state.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Independently reported by Antigravity's own self-analysis,
  costing "several manual interactions" to recover from in a fresh greenfield
  run — exactly the kind of first-run friction a scaffolding gap produces.
  `manual` `done_when` because the mechanism (which repository's scaffolding,
  which specific check) was not located within this dispatch's tool budget;
  the acceptance criteria define the mechanical work still needed.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate per the triage's L
  group. Pairs conceptually with F11 (verify has no path for a project with no
  tests yet) — both are "verify's mandatory-gate posture does not yet handle a
  brand-new greenfield project's actual starting state" instances.
- **Date:** 2026-08-29

## Progress, 2026-08-29 (dispatch NVA-W10-DIRTYCLAUDE, landed by the Elephant, commit `562ea6bc`)

Located and fixed in THIS repository's own scaffolding (proposal 1/2):
`PROJECT_IGNORE_SEED` (`plugins/pipeline-core/lib/project-onboarding-v3.mjs`)
now includes six anchored `.claude/` session-scratch entries —
`/.claude/worktrees/`, `/.claude/settings.local.json`, and four glob markers
for usage/consent/model-identity files this Pipeline's own scripts write —
named individually rather than a blanket `.claude/` ignore, so tracked
project configuration (`.claude/settings.json`, `.claude/pipeline.json`,
`.claude/pipeline.yaml`) stays tracked. Verified against a REAL git
repository (not a fixture assertion): `git check-ignore` against each new
path in `project-onboarding-v3.test.mjs`'s "onboarding seeds ignore rules
for the paths it writes into" test, plus a check that tracked `.claude/`
config is NOT swallowed.

**Not yet closing.** Acceptance criterion 1's exact repro — run the real
greenfield onboarding flow, then run `verify.mjs` itself immediately after
with no other manual changes, and confirm it does not fail on `.claude/`
tree-dirtiness — was not performed; verification stopped at the unit-test
level (real `git check-ignore`, not a real `verify.mjs` invocation).
Acceptance criterion 3 (naming verify's own cleanliness check with a
file/line reference) also remains open — this fix addresses the ignore-rule
side (what gets tracked), not the specific check inside `verify.mjs` or
`push-prepare.mjs` that reads tree cleanliness, which was not traced this
session.
