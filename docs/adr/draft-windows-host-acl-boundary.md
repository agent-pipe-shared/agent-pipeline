# Windows host ACL observations and private Pipeline authority

Status: proposed; PO-selected direction D145, qualification pending.

Date: 2026-10-25

## Context

A Claude Windows Greenfield start was blocked by inherited Authenticated Users
Modify permissions on a data-drive/project/marketplace chain. The start check
applied strict foreign-owner/write-ACL rules to ordinary plugin ancestors.
The October17 PO decisions already place human-controlled host properties
outside the agent threat model and reject requiring drive-root ACL changes.
The new D145 direction explicitly permits weaker Windows enforcement for
ordinary project and plugin paths in the next candidate.

Owner ACLs cannot distinguish a human from an agent running under the same OS
principal. The Pipeline's actual agent controls remain its supported execution
boundary, tool guards, genuine approval proofs and bound source/evidence
validation. Other-local-account hardening is a separate, narrower guarantee.

## Selected direction

Observe ordinary Windows host, project and plugin/source path facts without
requiring an owner-only or foreign-write-free ACL as a universal start or
execution prerequisite. Apply the same policy at the native access layer so
readiness does not merely defer the identical refusal to a requester or source
reader. Keep observed identities/security facts bound for change detection.

Retain the strict checks for Pipeline-owned private authority. Preserve
cryptographic approvals, candidate/content digests, compare-and-swap checks,
physical path containment, aliases/reparse rejection and genuine observation
failures. Do not change real host ACLs or manufacture positive custody facts.
Any later need to relax private authority requires its own bounded decision.

## Consequences

Ordinary inherited data-drive permissions no longer force a developer to move
their workspace or harden the drive before using the Pipeline. Windows loses
the ordinary-path foreign-owner/write-ACL exclusion guarantee. Linux/macOS keep
the existing POSIX owner/mode checks at their implemented authority/source
boundaries; this is an additional local-account integrity check, not a general
claim that these operating systems are safer or isolate same-user agents.

The existing strict ordinary-path policy assertions must be updated with this
explicit rationale, preserving the strict private-authority and physical-path
negative controls. Focused portable tests do not establish actual native NTFS
execution. Native Windows requalification and the scheduled final review and
Verify/Security course remain required.

## Affected contracts

- Windows native authority path observation, source reads and creation parents.
- Windows readiness and its operator guidance.
- Requester/source/registry consumers of those shared observations.
- Existing Windows authority/requester pins and setup documentation.

This draft records the selected strategy without accepting a particular patch
or declaring release readiness. PRD and Spec remain unchanged.
