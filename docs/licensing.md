# Public Core licensing

The current Public Core candidate uses the Sustainable Use License Version 1.0
(SUL-1.0), SPDX identifier `SUL-1.0`, with the repository-specific
Agent-Pipeline Additional Permission. The `LICENSE` file keeps the canonical
SUL-1.0 body unmodified and states the additional permission separately; the
SPDX identifier and canonical URL refer only to the base license. This is
source-available/fair-source licensing and must not be described as OSI Open
Source.

The selected boundary is deliberately standard-near and not an individually
negotiated two-user license. In practical terms, and always subject to the
governing `LICENSE` text:

- personal use, internal business use, internal use by a commercial company,
  and making or modifying a fork for the user's own purposes are permitted;
- affiliates, employees, contractors, and service providers may use the
  software solely on the licensee's behalf for the licensee's internal
  operations;
- free redistribution for non-commercial purposes is permitted when the
  license and notices travel with the copy;
- independent consulting, training, and support are permitted when
  Agent-Pipeline or a substantial derivative is not itself monetized;
- a separate agreement with the rightsholder is required only when
  Agent-Pipeline or a substantial derivative is itself monetized: sale; paid
  licensing or distribution; paid hosting, SaaS, or managed service;
  white-label use; material embedding as a value component of a paid product;
  or commercial redistribution;
- there is no automatic conversion to an OSI Open Source license.

`LICENSE` contains the governing text and `NOTICE` contains the project notice
and commercial intake path. `third-party-licenses.json` is the explicit current
dependency and incorporated-text inventory. The repository has no package
manager dependency manifest, but its Code of Conduct incorporates Contributor
Covenant 2.1 under that upstream work's CC-BY-SA-4.0 terms. Future dependencies
or third-party text must be added to the inventory before use and checked
against `governance/examples/policies/license-allowlist.json`.

André Twachtmann is the legal rightsholder for Agent-Pipeline project-authored
content and the commercial/CLA contracting party. Third-party material listed
in `third-party-licenses.json`, including Contributor Covenant text, remains
under its stated upstream ownership and license. On 2026-07-23, André
Twachtmann, acting as the named human
rightsholder reviewer, approved activation of the contributor CLA process. The
public record intentionally contains no private address, email address, or
private-account link. Every external contribution still requires both its DCO
sign-off and the Contributor's own express, current-version CLA acceptance;
a maintainer, bot, or submission automation cannot accept on the Contributor's
behalf.

GitHub branch protection for `main` must make
`contributor-gates / cla-and-dco` a required status check and require the PR
branch to be current with `main` before merge. The latter prevents an earlier
green result from surviving a later CLA change on `main`. Repository files
cannot prove those server-side settings; activation for merging therefore
requires an authenticated branch-protection read-back. The workflow's
machine-readable receipt is written to the current job log and runner-temporary
storage only; no immutable long-term archive is asserted.

The contributor gate's personal-acceptance workflow, trusted-base boundary,
technical data-privacy review, and fail-closed recovery order are documented in
[`contributor-gate-security.md`](contributor-gate-security.md). The separate
named-human data-privacy sign-off is historical and candidate-bound to commit
`f83803c767f90dceacea936ac3bd52c63dc24bd1` and tree
`9bdd679db74aa0b1b7877984df7324ffb880be86`; the CLA-process approval alone
did not imply it.

The candidate-bound licensing and privacy dispositions, the private and
neutral-public sanitized license-gate projections, and the SNT-1 Result are
historical evidence recorded under `backlog/evidence/` for that same frozen
candidate. They bind the seven governing license surfaces as they existed at
freeze, including the approved SUL-1.0 plus Agent-Pipeline Additional
Permission and cumulative DCO/Contributor-personal CLA semantics. Because
`docs/licensing.md` changed after that freeze, the live seven-surface set is
not covered by those records. This document makes no current
licensing/privacy disposition or release claim: release consumption awaits a
newly frozen candidate and a new named-human licensing/privacy review. The
exact evidence and sanctioned construction path are recorded in
[`snt-1-activation-prerequisite.md`](../specs/2026-07-19-sprint-sentinel-epic/snt-1-activation-prerequisite.md).
The historical closed backlog record is not rewritten or treated as current
evidence.

The PO has represented for this candidate that all current project-authored
content is 100% owner-controlled and that no external code is known to be
incorporated. That representation is recorded provenance, not an automated
proof or a legal opinion; identified third-party text remains separately
attributed. The 2026-07-23 rightsholder approval activates the CLA acceptance
process; it is not a legal-effectiveness guarantee or a release approval.

This repository does not provide legal advice, define prices or contract
terms, guarantee the effectiveness of any rights grant, or silently grant
commercial monetization rights. Earlier commits or copies already received
under prior terms remain governed by the terms and notices supplied with
them; this candidate does not purport to change those grants retroactively.
