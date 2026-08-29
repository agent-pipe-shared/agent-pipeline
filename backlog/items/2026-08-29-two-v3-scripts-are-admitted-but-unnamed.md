---
schema: pipeline.backlog-item.v1
id: pipeline.two-v3-scripts-admitted-but-unnamed
type: defect
owner: pipeline
status: open
created: 2026-08-29
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
