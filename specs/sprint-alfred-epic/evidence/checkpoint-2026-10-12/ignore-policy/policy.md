# Durable evidence ignore policy checkpoint

The project owner applied two path-scoped exceptions in the root `.gitignore`:

```gitignore
!specs/**/evidence/**
!backlog/evidence/**
```

Every file in those canonical durable evidence locations is now eligible for
Git regardless of suffix. Durable citations and handovers must live in tracked
project paths and be committed to travel to another checkout. Root `evidence/`
remains generated output, and `/scratch/` remains temporary workspace. The
policy does not unignore those trees or private local configuration.

## Readback

Direct `git check-ignore -v --no-index` checks against the applied root rules
returned the new negated rule for each durable fixture:

| Fixture | Readback |
|---|---|
| `backlog/evidence/probe.log` | `.gitignore:108:!backlog/evidence/**` |
| `backlog/evidence/probe.jsonl` | `.gitignore:108:!backlog/evidence/**` |
| `backlog/evidence/probe.tmp` | `.gitignore:108:!backlog/evidence/**` |
| `specs/feature/evidence/probe.log` | `.gitignore:107:!specs/**/evidence/**` |
| `specs/feature/evidence/probe.jsonl` | `.gitignore:107:!specs/**/evidence/**` |
| `specs/feature/evidence/probe.tmp` | `.gitignore:107:!specs/**/evidence/**` |
| `specs/feature/plans/handover.md` | no ignore match |

Negative checks confirm generated and private material remains ignored:

| Fixture | Readback |
|---|---|
| `evidence/generated.log` | `.gitignore:52:/evidence/*` |
| `evidence/generated.jsonl` | `.gitignore:102:*.jsonl` |
| `scratch/generated.jsonl` | `.gitignore:38:/scratch/` |
| `.env` | `.gitignore:98:.env` |
| `.pipeline/private-overlay.yaml` | `.gitignore:22:.pipeline/private-overlay.yaml` |

For verbose `git check-ignore`, a returned `!` pattern is the expected
track-eligible result; a normal pattern is ignored. The handover fixture has no
matching ignore rule. These are path-rule readbacks, not commits or push
evidence.

## Consumer onboarding gap and future fix

The current onboarding source is
`plugins/pipeline-core/lib/project-onboarding-v3.mjs`. Its
`PROJECT_IGNORE_SEED` (lines 208–238) writes `/scratch/`, `/evidence/`,
`/project/pipeline-state.json`, and named Claude local-state paths for a new
project. It does not write durable evidence exceptions. The adjacent
`REQUIRED_PROJECT_IGNORE_PATTERNS` (line 248) is derived only from seed lines
starting with `/`, so the existing owned-`.gitignore` gap check cannot require
the new `!specs/**/evidence/**` and `!backlog/evidence/**` rules. The gap check
at `missingProjectIgnorePatterns()` (around line 5720) only tests exact trimmed
line presence; it does not test Git's effective last-match behavior.

The seed itself does not add global `*.log`, `*.jsonl`, or `*.tmp` rules, so
those suffixes are not ignored by the seed alone. A consumer's existing
`.gitignore` may add such global rules, though. In that case durable evidence
can still be ignored because onboarding currently checks only its anchored
private/generated paths and not canonical durable evidence paths.

Future onboarding work should add the two canonical negations to
`PROJECT_IGNORE_SEED`, require them for an already-owned `.gitignore`, and
update the missing-pattern guidance to present the negation rules correctly.
The check should verify effective `git check-ignore` behavior for representative
`.log`, `.jsonl`, and `.tmp` evidence paths, plus negative fixtures for root
generated evidence, scratch, and private local files. Exact line presence
alone is insufficient if a later broad ignore pattern overrides a negation.
No onboarding production code or tests were edited for this checkpoint.
