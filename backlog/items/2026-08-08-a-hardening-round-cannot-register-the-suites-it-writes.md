---
schema: pipeline.backlog-item.v1
id: pipeline.hardening-round-cannot-register-its-own-suites
type: defect
owner: pipeline
status: open
created: 2026-08-08
sprint: alfred
due: 2026-08-22
source: "Observed 2026-08-08 during the 0.5.4 hardening block itself: the SETUP-2b dispatch was refused when registering its own new suite, correctly stopped rather than routing around the guard, and the registration is still outstanding. Second confirmed instance of the guard-testpath gap already recorded in docs/state.md."
done_when: manual
---

# A hardening round cannot register the test suites it writes

## The loop, and where it does not close

`project/guard-config.json` TP-3 protects `harness/scripts/verify.mjs` — the
single verify-gate script that the stop hook, Goldfish submission and CI all run.
Protecting it is right; it is the file whose weakening would make every other
gate unobservable.

The override that clears TP-3 follows the push-approval mode
(`guard-testpath.mjs:255`, `readPushApprovalMode(projectDir)?.mode ?? "signature"`).
This repository is in `signature` mode, so no in-session clearance exists and a
detached Ed25519 signature is required.

The consequence is structural: **any work package that adds a test suite cannot
make that suite run under Verify.** A block whose entire purpose is adding
coverage ends with its coverage unregistered, and an unregistered suite is
invisible to the gate — the exact defect already filed as
`2026-08-07-unregistered-suite-is-red-and-invisible-to-verify.md`.

It is also not a one-off ceremony. The signature binds to a `--request-sha256`
computed from the exact command, so it cannot be pre-authorized before the final
edit is known, and it cannot be amortized across several registrations unless
they are batched into one edit at the very end of a block.

## Why the two obvious workarounds are both wrong

- **Switch `push_approval` to `chat`.** That is the anti-pattern this whole
  hardening round exists to remove: passing a gate by weakening it. It also
  weakens the *push* gate to clear a *test-path* one, which is a strictly larger
  concession than the problem requires.
- **Remove or narrow TP-3.** That drops the protection on the verify script
  while an agent is running unattended, which is precisely the window in which it
  matters.

Both were considered and rejected during the block rather than being taken. That
rejection is the reason the registration is still outstanding, and it is the
correct outcome — the gap is in the mechanism, not in the discipline.

## The observed instance

The SETUP-2b dispatch attempted the registration twice, was refused identically
both times, confirmed with `git status` that the file was never modified, and
stopped with a missing-access report. It did not route around the guard with a
shell write. The previous instance of this same gap, recorded in
`docs/state.md`, *was* walked around with a shell write — so the discipline has
improved and the mechanism has not.

## Direction, not a design

1. **Decide whether suite registration is the same risk class as editing the
   verify script's logic.** Appending an entry to a suite list and changing what
   the gate does are not obviously the same act. If they are not, the protection
   can distinguish them, and the loop closes without weakening anything.
2. **If they are the same class, make the ceremony batchable and predictable.**
   A block should be able to collect its registrations, produce one exact
   command, and have it signed once, with the command available for review before
   the signature is requested rather than derived during it.
3. **Whatever is chosen, an unregistered new suite must be loud.** Today it is
   silent: the suite exists, passes when run by hand, and contributes nothing to
   the gate. A check that fails when a `*.test.mjs` file exists without a
   registration would surface the gap at the moment it is created, independently
   of how (1) and (2) are answered. This is the part that is worth doing whatever
   else changes.

## Related

- `2026-08-07-unregistered-suite-is-red-and-invisible-to-verify.md`
- `2026-07-19-verify-gate-scoped-registration.md`
- `2026-08-08-an-authority-gate-is-bypassable-by-choosing-a-different-write-tool.md`
  — the same guard family, read from the other side.
- `docs/state.md`, 2026-08-08 GF-056 — the first instance, which was walked
  around rather than reported.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted, both candidates 1 and 3 of the paired item
  `2026-08-07-unregistered-suite-is-red-and-invisible-to-verify.md` — the
  generalized unregistered-suite detector (this item's own direction 3) AND
  actually registering the concrete outstanding suite. Same decision,
  recorded once, cross-referenced here (cluster A).
- **Rationale:** PO, 2026-08-11: "1 und 3" (against the sibling item's numbered
  options, which this item's own direction 3 matches exactly). This item's
  directions 1/2 (whether suite registration is the same risk class as
  editing verify.mjs's logic, and if so making the ceremony batchable) remain
  open design questions the detector doesn't resolve on its own — the
  detector makes the gap loud; it doesn't itself close the TP-3 ceremony cost.
- **Assignment (if accepted):** See the sibling item for the concrete
  assignment split (detector first, registration ceremony second). This
  item's directions 1/2 stay open, unassigned, for whoever picks up the
  registration-ceremony half.
- **Date:** 2026-08-11

- **Update, 2026-08-17 — the detector half (this item's own direction 3) has
  shipped; item stays `open`.** See the sibling item
  (`2026-08-07-unregistered-suite-is-red-and-invisible-to-verify.md`)'s
  2026-08-17 update for the detector's commits, Critic history, and closure
  evidence path. This item's directions 1/2 (whether suite registration is
  the same risk class as editing `verify.mjs`'s logic, and if so making the
  TP-3 ceremony batchable) remain fully open — the detector makes the gap
  loud, it does not close the ceremony-cost question this item is actually
  about.
- **Date:** 2026-08-17

### Update, 2026-08-18 — directions 1/2 named to a specific still-open Sprint

- **Decision:** deferred — owned by Sprint Alfred.

Directions 1 and 2 (whether suite registration is the same risk class as
editing `verify.mjs`'s logic, and if so making the TP-3 ceremony batchable)
were recorded as "fully open" with no assignment or target window, which the
0.6.0 release bar requires naming. This is real architecture/governance work
on a TP-3-protected control-integrity surface — matches **Sprint Alfred**'s
confirmed scope ("Agent-first architecture, mechanical governance, measurable
rigor, and control integrity", `docs/adr/0043-post-go-live-sprint-model.md`,
2026-08-17 amendment), the same window already used for the closely related
`2026-08-12-shared-verify-evidence-slot-corrupted-by-concurrent-dispatches.md`
and `2026-08-12-four-critic-preimage-pins-drifted-or-never-valid.md`. No
implementation attempted here.
- **Assignment (if accepted):** next available Alfred slot, unassigned —
  directions 1/2 as already scoped above; the detector (direction 3) is
  already shipped per the 2026-08-17 update.
- **Date:** 2026-08-18
