# Held patch notes — pin the live-owner case of the owner-route orphan release (D231 slice 1, candidate 15c)

Patch: `w26-heal-leaves-a-live-owner-route-binding-and-releases-it-when-the-owner-is-gone.patch`. Test only, one file (`scripts/pipeline-state-result-bootstrap.test.mjs`). Apply AFTER `w23` (it adds the owner-route cases this one sits next to); it does not apply on the bare tree.

## Why

The w23 release of an orphaned owner-route binding is safe only because it releases when the recorded owner process is PROVEN dead. The existing heal case covers the dead branch (kill, blocked, heal releases) and the clean project, but nothing pinned the opposite branch: a binding whose owner is still running must be reported `live` and left alone, otherwise a second heal could cut the binding out from under a call that is still working.

## What

One case appended after the existing heal case. It kills an owner-route call after the bind (the existing seam), then rewrites the record's `process` to the observed identity of a real running stand-in process, so the liveness check sees a live owner:
- heal reports `ownerRoute.status === "live"`, the binding stays held, its registry member stays in flight and the next call is still refused with `COR-BINDING-HELD`;
- after the stand-in is gone the same heal reports `released` and the project reads back clean.
Skipped on Windows, where the owner liveness is reported `unknown` (heal then says `unverifiable`); the native Windows run is an open gate.

## Evidence

- bootstrap suite 29/29 in the stacked clone (w23 + w24 applied).
- Mutation: the liveness check returning `dead` for an identical process turns the new case red (`released` instead of `live`).
- The case-completion checker stays valid; no registry row or pinned count moves for this suite.

## Not covered

- The `unverifiable` branch (non-proof of death on an unsupported platform) is not exercised here.
- Real-registry, real-consumer run: first live check is the next orphaned owner-route call after the install.
