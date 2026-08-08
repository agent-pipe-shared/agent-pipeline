---
schema: pipeline.backlog-item.v1
id: pipeline.hardening-round-cannot-register-its-own-suites
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "Observed 2026-08-08 during the 0.5.4 hardening block itself: the SETUP-2b dispatch was refused when registering its own new suite, correctly stopped rather than routing around the guard, and the registration is still outstanding. Second confirmed instance of the guard-testpath gap already recorded in docs/state.md."
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

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
