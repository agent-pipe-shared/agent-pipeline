---
schema: pipeline.backlog-item.v1
id: pipeline.two-v3-scripts-admitted-but-unnamed
type: defect
owner: pipeline
status: closed
created: 2026-08-29
closed_at: 2026-08-29
closure_repository: self
closure_commit: e62b1dc7
closure_evidence: plugins/pipeline-core/skills/pipeline-start/references/onboarding-recovery.md
sprint: nova
tracking: "NOW / Nova A — found by NVA-W8-VERIFYREG2's own new reachability check running against this repository"
source: "harness/scripts/check-product-capability-inventory.mjs's checkEntryPointReachability(), landed 2026-08-29 for backlog/items/2026-08-28-nothing-checks-that-a-shipped-capability-is-reachable.md, discovered these two real instances against the live repo."
done_when: manual
---

# Two V3 scripts are admitted but named by no skill or guard

## What is verifiable

`node harness/scripts/check-product-capability-inventory.mjs --check-reachability`
(equivalently `checkEntryPointReachability({root})`) reports two `admitted-but-unnamed`
findings:

- `plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs`
- `plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs`

Both are explicitly admitted by `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`
(their basenames appear in its sanctioned-invocation dispatch), so an agent that already
knew to run them would not be refused. But no skill body and no lazily-loaded skill
`references/*.md` file names either script — they are mentioned only in `docs/` operational
material (`docs/v3-consumer-onboarding.md`, `docs/guard-maintenance-window-threat-model.md`,
ADR files), which an agent session never loads as part of ordinary bootstrap or recovery
flow. A third script the same check originally flagged, `push-init.mjs`, turned out to
already be named in `plugins/pipeline-core/skills/pipeline-start/references/push-approval.md`
— fixed by widening the checker's corpus to include skill `references/*.md` files, not by
touching this pair.

## Why this is tracked rather than fixed inline

Naming these two correctly requires knowing the actual scenario an agent should reach for
each — `runner-profile-migration-v3.mjs`'s three subcommands (`inspect|plan|apply`) and
`v3-bootstrap-authority.mjs`'s read-only validator role in the V3 cutover — well enough to
write accurate guidance in `references/onboarding-recovery.md` or wherever else fits,
without inventing an invocation scenario that turns out to be wrong. That is a design
decision, not a mechanical one, so it is filed rather than guessed at inline.

## Direction

Add a short pointer for each script to the appropriate lazily-loaded skill reference file
(most likely `plugins/pipeline-core/skills/pipeline-start/references/onboarding-recovery.md`,
which already documents adjacent V3 recovery flows), phrased from an accurate understanding
of when an agent should actually invoke each one directly.

## Acceptance criteria

- `node harness/scripts/check-product-capability-inventory.mjs --check-reachability`
  reports zero findings for these two scripts.
- The added guidance is accurate: it names a real scenario in which an agent would run the
  script directly, not an invented one.

## Related

- `2026-08-28-nothing-checks-that-a-shipped-capability-is-reachable.md` — the check that
  found this.

## Closed, 2026-08-29 (dispatch NVA-R41-V3SCRIPTDOCS)

Fixed by commit `e62b1dc7` — two guidance paragraphs added to
`plugins/pipeline-core/skills/pipeline-start/references/onboarding-recovery.md`:

- `runner-profile-migration-v3.mjs`: named as the direct-invocation recovery
  path for a `legacy_source` diagnostic (a pre-V3 pipeline authority) —
  `project-onboarding-v3.mjs`'s own `repair` field for that diagnostic
  literally reads "use runner-profile-migration-v3 inspect, plan, then apply
  --activate" (confirmed at `lib/project-onboarding-v3.mjs:1194`), and this is
  the same migration CLI `project-onboarding-v3.mjs` calls internally via
  `inspectRunnerProfileMigrationV3`/`planRunnerProfileMigrationV3`/
  `applyRunnerProfileMigrationV3`. The `inspect|plan|apply [--activate]
  [--initialize-missing-runtime]` sequence is named explicitly.
- `v3-bootstrap-authority.mjs`: named as the direct, standalone readiness
  check for V3 bootstrap authority (`--root <dir> [--runner claude|codex]`),
  confirmed read-only from its own code (`main()` only reads via
  `validateV3BootstrapAuthority` and writes a JSON report; it performs no
  mutation) — the same function `project-onboarding-v3.mjs` calls internally.

**Acceptance criteria:**

1. `node harness/scripts/check-product-capability-inventory.mjs
   --check-reachability` reports zero findings for these two scripts —
   confirmed (`PASS: entry-point reachability`). Note: this check already
   reported zero for both basenames before this fix too, because
   `KNOWN_UNREACHABLE_ENTRY_POINTS` in the checker currently exempts them by
   name; that allowlist was left untouched (out of this dispatch's briefed
   scope, which named only the skill reference file(s) plus this item). A
   probe script (`discoverEntryPoints` output, scratch-only, not committed)
   confirmed both basenames are real discovered entry points the checker's
   `admitted && !named` branch would otherwise catch. The added guidance now
   makes both genuinely present in `agentReadableCorpus()` (the skill
   `references/*.md` corpus the checker scans), independent of the allowlist
   — but the allowlist entries themselves still mask a regression here until
   someone removes them, which is a follow-up, not part of this closure.
2. The guidance is accurate, sourced from each script's own code (docstring +
   CLI arg parsing) and from `project-onboarding-v3.mjs`'s own repair text,
   not invented — confirmed by direct reading, cited above.

Verified: `check-consumer-safe-paths.test.mjs` 9/9 pass; `check-doc-contracts.mjs`
valid (1179 files); `check-product-capability-inventory.test.mjs`'s pre-existing
HAW-A02 failure confirmed unrelated via `git stash` (fails identically without
this change).

**Follow-up not done here (out of scope):** `KNOWN_UNREACHABLE_ENTRY_POINTS` in
`harness/scripts/check-product-capability-inventory.mjs` still lists both
`runner-profile-migration-v3` and `v3-bootstrap-authority`; removing those two
entries would let the checker enforce discoverability for them going forward
instead of masking it. Left for the Elephant/a follow-up dispatch since this
briefing's scope was restricted to the skill reference file(s) and this item.
