# Overview

Agent-Pipeline is for controlled, agent-assisted software delivery where a team
needs a reviewable record beyond a chat history. It turns an intent into a
bounded change, deterministic evidence, independent review, and a preserved
decision. Candidate-bound receipts and validated packages can support an audit
trail; they do not certify compliance or replace an auditor.

## The next release line: 0.7.0

`0.7.0` names the next distributed Alfred architecture scope. Until that
version is released, an application repository continues to use its approved
GitHub-distributed plugin version; a maintainer candidate is not an
installation recommendation, production-availability claim, or proof that
release gates passed. The scope adds a staged adoption route for existing
repositories, a machine-readable architecture map, baseline and fitness
checks, and typed architecture impact at feature close. Begin with the
read-only [adoption status and proposal](usage.md#assess-architecture-adoption-in-an-existing-project)
in the repository you intend to govern.

**Names.** *Alfred* is the working name of this `0.7.0` scope. *Phoenix* and
*Nova* are the two product strands it integrates. *Sprint Alfred* is the
maintainer sprint that builds the scope.

| Product strand | What it contributes to this release scope | Status |
| --- | --- | --- |
| Phoenix | Durable delivery governance: explicit human decisions, candidate-bound evidence, deterministic gates before review, safe external-action boundaries, and recoverable public records. | Integrated foundation |
| Nova | Runner-aware execution and guided adoption: public Driver actions, resumable onboarding context, a real verify setup, and scoped parallel delivery. | Implemented in the repository; final `0.7.0` acceptance pending. |

**Status.** The `0.7.0` candidate is not yet qualified: it still needs
criterion-level evidence, full Verify, security checks, independent review, and
any applicable human acceptance, and host-dependent behavior needs readback from
the runner that actually executes it. This overview claims neither a released
nor a fully accepted `0.7.0`.

The documented Greenfield route (empty directory to first implementation step)
is covered for Claude, Codex, and Antigravity; see [Usage](usage.md). Runner
integrations are described by their evidence: a common methodology does not
mean that every host has identical native hooks, sandbox isolation, model
identity, or platform coverage. Missing, stale, malformed, or
candidate-mismatched evidence stays a typed non-success.

For the product entry point, use the top-level [README](../README.md); for
everything else, the [documentation map](README.md). The
[Operating Model](operating-model.md) is the normative process contract.
