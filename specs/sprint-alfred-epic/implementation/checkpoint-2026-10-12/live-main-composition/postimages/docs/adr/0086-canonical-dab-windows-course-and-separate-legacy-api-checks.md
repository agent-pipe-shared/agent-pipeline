# ADR-0086 — Canonical DAB Windows course and separate legacy API checks

## Status

Accepted architecture choice, 2026-10-11, attributed to the explicit PO chat approval recorded in the companion approval preview. Publication and compilation remain Root-owned; implementation and qualification status are separate.

## Date

2026-10-11

## Context

The normal design flow uses canonical DAB review receipts and one aggregated design proof. ADR-0085 retires the separate DWP approval artifact and readiness content review. Original RC12C001 still records a native Windows failure in the legacy readiness fixture; presentation retirement alone does not resolve that failure or establish native coverage.

## Decision

Test the canonical DAB design flow on native Windows as the current design-course successor. Check retained legacy Readiness APIs separately against their surviving compatibility contracts; do not reactivate the retired DWP approval ceremony. Preserve the original RC12C001 failure and explicitly map its successor coverage. Neither the new course nor the separate API check is deemed successful by this decision.

Native course evidence must exercise actual Windows process ownership, custody and finalization, real review receipt consumption, canonical DAB binding, the one design proof and terminal readback. Existing controlled or POSIX evidence cannot substitute for native Windows evidence. Retained standalone APIs require a finite compatibility inventory and explicit per-API disposition; no total API decommissioning is implied.

## Consequences

The canonical course and legacy API compatibility are separate engineering obligations. Existing stored evidence remains readable and original failures remain historical evidence. One common Design package carries this decision; no separate ADR terminal or signature is added. This scope decision confers no HGO grant, planSignature, protected-write executor, native PASS or item closure.

## Affected Contracts

ADR-0085; canonical DAB design approval; native Windows course and legacy RC12C001; retained runCodexDesignReadinessHost/runCodexToolFreeDesignReadiness compatibility. The accepted carrier amendment remains authoritative against DWP reactivation.
