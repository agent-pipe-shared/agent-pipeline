# Agent-binding OS-boundary disposition

Date: 2026-09-11
Backlog item: `pipeline.agent-binding-guards-are-not-os-level-sandboxing`

## Decision proved

The item is an umbrella for one product-scope decision. Its own 2026-08-29
re-triage records the PO's standing threat model: Agent-Pipeline guards protect
against cooperative or accidentally drifting agents. They do not claim to
contain a deliberately malicious process at the syscall boundary. Credential
removal, a `bwrap`-style sandbox and a general script allowlist were explicitly
excluded from the candidate under that decision.

The PO reconfirmed on 2026-09-11 that native Codex sandbox work is not accepted
under WSL and is deferred to a future native-Windows package. That narrower host
decision does not expand this umbrella's security claim and does not hold Nova B
open.

## Buildable consequences

- `pipeline.pre-push-hook-is-offered-not-installed` is closed at
  `caf9a2e6cd9c28390fc11bc9ccf9792ddcc3b0b8`. Its closure evidence is the
  onboarding suite, which proves the Git-layer backstop is installed by default
  while preserving explicit decline and foreign-hook handling.
- `pipeline.a-node-script-defeats-every-file-protection-guard` is closed at
  `b4908639ac14e53832a3ec6f3b2a68bf06a2fed7`. It delivers the separately tracked
  integrity-detection and pre-commit route without pretending that a PreToolUse
  hook observes child-process syscalls.

Both commits are ancestors of the current Nova B line. Their item frontmatter
and transition-ledger closures are present and are validated by
`plugins/pipeline-core/scripts/check-backlog-state.mjs`.

## Honest residual

Indirect scripts can still bypass a tool-call guard when operated by a
deliberately adversarial process. This is the accepted threat boundary, not an
unimplemented Nova B promise. The product must continue to describe guard
enforcement as tool-, Git-hook- and integrity-check enforcement and must not
market it as OS-level isolation.
