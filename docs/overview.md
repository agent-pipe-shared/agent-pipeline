# Overview

Agent-Pipeline is for software teams that let AI agents write code and still
have to show afterwards what was decided, what was checked and by whom. It turns
an idea into a bounded change, deterministic checks, an independent review and a
preserved decision. Its receipts are bound to the exact commit that was checked
and can support an audit trail; they do not certify compliance and do not
replace an auditor.

## What you get

- **A written design before code.** The agent drafts a requirements document
  and a spec with you; an independent read-only reviewer reads them; you approve
  once.
- **Work cut into small, checkable pieces.** Each piece is built by a fresh agent
  with a defined write scope, then checked by tests and security scans.
- **An independent review of the result**, by an agent that never saw the
  implementing agent's reasoning.
- **A record you can hand over.** Receipts, decisions and review reports stay in
  the repository and can be exported as an offline bundle.
- **Humans decide at a few fixed points**: the design, the final acceptance and
  every push. Everything in between is agent work.

It works with Claude Code, Codex and Antigravity. The method is the same on all
three; what each host can enforce natively differs and is stated per runner in
[runner support](runner-support.md).

## The next release line: 0.7.0

`0.7.0` adds a guided path from an empty directory to a signed design and into
implementation, a machine-readable architecture map with boundary checks, a
quality readback at the close, and a staged route for adopting the architecture
controls in an existing repository. What it contains is listed in
[what's new in 0.7.0](whats-new-0.7.0.md).

**Status.** `0.7.0` is not released. Until it is, an application repository
keeps using the plugin version it already has approved; a pre-release build is
not an installation recommendation and not a claim that the release checks
passed. Full verification, the security checks, the independent review and the
final human acceptance of `0.7.0` are still outstanding. The new path has been
run end to end on all three runners, but those runs are not a release proof.

## Where to start

1. Read the top-level [README](../README.md), then [Setup](../SETUP.md).
2. Follow [Usage](usage.md); for a new project start with
   [from an idea to the implementation phase](usage.md#from-an-idea-to-the-implementation-phase),
   for an existing one with the
   [adoption assessment](usage.md#assess-architecture-adoption-in-an-existing-project).
3. The limits you may meet are in [known issues](known-issues.md); everything
   else is in the [documentation map](README.md). The
   [Operating Model](operating-model.md) is the normative process contract.

Missing, stale or mismatching evidence is always reported as a typed
non-success, never counted as a pass.
