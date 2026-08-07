# Second backlog reconciliation pass, 2026-08-06 night

Autonomous AFK reconciliation pass, continuing the same evening's work as
`backlog/evidence/2026-08-06-onboarding-runner-identity-reverification.md`.
Five parallel read-only investigation agents checked the ~24 remaining open
items against current HEAD for the same "fix landed, item never reconciled"
pattern. This file documents the four items closed as a direct result; other
findings from the same pass (narrowed scope, deepened proposals, confirmed
still-open) are recorded in each item's own body, not here.

## Closed in this pass

### `pipeline.po-gate-authority-path-canonicalization`

Fixed by `3652d92ac02757d5bf0fde1e816e4f70710a0a1b` ("fix(pipeline-core):
correct native-Windows path-case mismatch in resolvePoGateRepositoryTopology"),
2026-07-25, the day after the item was filed. Current
`plugins/pipeline-core/lib/po-gate-authority.mjs:336-351` compares both sides
through `realpathSync.native` immediately before the equality check, exactly
the fix class the item's Proposal asked for. Independently verified by
running the suite, not just reading: `node --test
plugins/pipeline-core/lib/po-gate-authority.test.mjs` → **36/36 pass**,
including a dedicated mis-cased-cwd fixture (lines 788-818) asserting the
topology still resolves correctly from a deliberately mis-cased path, and a
regression guard that a genuinely different physical directory is still
rejected. The Windows-specific case-folding itself cannot be exercised for
real on this Linux/WSL2 host (`realpathSync.native` is a documented no-op on
POSIX); the fix shape, the commit's stated intent, and the passing regression
tests together are the evidence, not a native-Windows run.

### `pipeline.ready-gate-env-var-runner-authority`

The item's own Triage section (already filled in) states this was delivered
by commits `a2089cdfd7621288691601046c5ef1a8598d92a1` and
`f5e41744edfcc0f8cb76e36036cde90fa989582f`; both confirmed to exist via `git
log`/`git show`. Only the frontmatter `status:` field had never been flipped
to match. Closure bound to `f5e4174` (the later of the two, which completed
the fix by migrating the two ready-gate callers left broken by `a2089cd`).

### `pipeline.pipeline-state-rebind-codex-default-runner`

Same pattern: Triage section already written and dated 2026-08-06, naming
commit `7514fb95f23d6b30bd42bbed2435f2dc4d76ca61` ("fix(pipeline-state):
thread invoking runner through PO-authority-rebind V4 readback"). Confirmed
the commit exists via `git log`. Only the frontmatter `status:` field was
stale.

### `pipeline.setup-mjs-marketplace-name-collision-defeats-local-dev-installs`

Same pattern: Triage section already written, naming commit
`d3db4a07dee565c1eeee2eb1e1e77ffcd2ca4e0a`. Independently verified rather than
trusted: `.claude-plugin/marketplace.json` reads `"name": "agent-pipeline"`
and `setup.mjs:925` reads `marketplaces["agent-pipeline"] = {` — the two
agree, closing the collision. Only the frontmatter `status:` field was stale.

## Net observation

Four of the ~24 items checked in this pass follow one specific failure mode:
the Elephant of a past session wrote a correct, evidenced Triage section
(sometimes even dated) recording a fix — and then never flipped the
frontmatter `status:` field or ran the ledger reconciliation, so the item
stayed `open` in every index/listing despite being done. This is a process
gap worth a `workflow-improvement` item of its own if it recurs again next
session: closing a backlog item currently requires two separate,
easy-to-forget mechanical steps (write the Triage prose, AND flip
status+closure fields+reconcile the ledger) with nothing enforcing the second
once the first is done.
