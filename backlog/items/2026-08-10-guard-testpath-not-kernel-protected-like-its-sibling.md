---
schema: pipeline.backlog-item.v1
id: pipeline.guard-testpath-not-kernel-protected
type: defect
owner: pipeline
status: open
created: 2026-08-10
source: "Found on 2026-08-10 by the WP-O1O2-CACHING-REWORK1 dispatch while fixing a related, narrower gap (the module hosting O-2's new ledger-narrowing check was not a NEVER_LIFTABLE_KERNEL_PATHS member). While proposing that fix, the dispatch checked the two real GS-6/TP-* call sites named in the O-1/O-2 design doc and found the same class of exposure already existed, independent of anything this sprint added. Verified independently by the Elephant against source before filing."
due: 2026-09-09
---

# `guard-testpath.mjs` is not a never-liftable kernel path; its sibling `guard-gate-strength.mjs` already is

## Description

`plugins/pipeline-core/lib/guard-maintenance-window.mjs:120-128`'s
`NEVER_LIFTABLE_KERNEL_PATHS` protects `guard-gate-strength.mjs` (the GS-6
enforcement hook) from being edited under an active Guard Maintenance Window —
exactly the recursive-hole protection ADR-0058 Decision 3 exists for. Its
sibling, `plugins/pipeline-core/hooks/guard-testpath.mjs` (the TP-* enforcement
hook, the other file `windowCoversRule` is called from), is **not** a member of
that list.

Confirmed against source: `guard-gate-strength.mjs:199-208` matches any path
inside the live plugin root as `LIVE_PLUGIN_RULE`; `:227-240` admits an
`Edit`/`Write` to any such path that is not a kernel member, under any active,
correctly-scoped, unexpired GS-6 window — a window legitimately armed for any
unrelated purpose. `guard-testpath.mjs` is such a path. One edit to it under
such a window (for example, weakening or removing its TP-* refusal, or — once
O-2's design lands — the `ledgerConfirmsLiveGmwGrant` call it will host)
survives the window's own expiry: closing or expiring the window restores
GS-6's own refusal, but nothing restores a hand-edited guard file.

## Why this is not merely theoretical

This repository already treats the identical exposure in
`guard-gate-strength.mjs` as serious enough to name explicitly in
`NEVER_LIFTABLE_KERNEL_PATHS` and in ADR-0058's own rejected-alternatives
reasoning ("a window that also covers the file that verifies windows would let
the first edit disable its own expiry check"). `guard-testpath.mjs` performs
the analogous role for the TP-* rule family — it is the file that decides
whether a protected test path may be edited at all — and today carries none
of that protection.

## Discovered via, and scoped narrower than

The O-1/O-2 design doc (`specs/sprint-phoenix-epic/design/gmw-hgo-evidence-
intake-into-the-human-ledger.md`, §15.1.6 (iv)) proposes adding ONE new module
(`guard-authority-ledger-intake.mjs`, not yet built) to the kernel list, for
the same reason, because that module will host O-2's new narrowing check. That
fix is narrowly scoped to the module this sprint's design adds — it explicitly
does not decide this item, and says so: "[the fix] does not by itself make
O-2's narrowing unremovable, because the second call site,
`guard-testpath.mjs` ... is likewise not a `NEVER_LIFTABLE_KERNEL_PATHS`
member ... That exposure is inherited, not created here."

## The decision, and its real cost

Adding `guard-testpath.mjs` to `NEVER_LIFTABLE_KERNEL_PATHS` closes this gap
completely and cheaply (one array entry, same shape as its six siblings, no
logic change). The cost is real and should be weighed, not assumed away: the
file becomes permanently uneditable under any Guard Maintenance Window,
exactly as `guard-gate-strength.mjs` already is — a genuine bug in TP-*'s own
logic would then need a different, out-of-session route to fix (the PO editing
it directly, or a separate installed-plugin-copy workflow), the same
limitation this repository already accepts for `guard-gate-strength.mjs`
today.

## Proposed repair

One new entry in `NEVER_LIFTABLE_KERNEL_PATHS`
(`guard-maintenance-window.mjs:120-128`):

```js
"plugins/pipeline-core/hooks/guard-testpath.mjs",
```

Same string shape as the six existing entries; derives unchanged through
`PLUGIN_KERNEL_SUFFIXES`. No change to `isNeverLiftableKernelPath`'s logic or
to any caller.

## Related

- `specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-
  ledger.md` §15.1.6 (iv) — the narrower, already-fixed sibling gap that
  surfaced this one.
- `docs/adr/0058-guard-maintenance-window.md` — the kernel-protection model
  this item is scoped against.
