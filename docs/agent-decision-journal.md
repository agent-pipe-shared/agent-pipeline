# Agent decision journal

The Agent Decision Journal records only material, closed observational events:
assumptions, selections, verification scope, fallback, and escalation. Each
record has a stable reason code, exact candidate digest, optional human-decision
link, and explicit lifecycle state. It cannot grant, consume, revoke, or
replace human authority.

The canonical agent stream rejects free text, prompts, tool output, terminal
history, raw logs, chain-of-thought, account data, and authority-shaped fields.
It also rejects a journal event whose candidate digest does not match its
envelope candidate. Supersession is explicit and remains an observation link,
not an implicit policy change.

## External command offers and recovery

A Pipeline-known command or script is represented as one closed
`command-offer` journal event before it can be presented or initiated. The
record retains only a stable operation class/version or public-safe governed
artifact digest, candidate/repository/scope and policy digests, side-effect and
authority class, execution-assurance state, and typed omissions. It never
contains command text, arguments, paths, credentials, prompts, transcripts, or
unrestricted output.

`recordCommandOffer` requires verified append readback before presentation.
`recordPipelineAttempt` records an attempt before an executor can run; for a
destructive, guard-bypassing, or authority-changing action it delegates to the
human-authority verifier with an exact decision/candidate/repository/scope
tuple. This is the integration seam for Cyborg's later signed human-attestation
proof: an offer, transport state, or replay result cannot substitute for it.

User-executed work remains `execution-unobserved` until an independent bounded
evidence verifier confirms `observed-completed` or `readback-verified`.
Failures, partial results, cancellation, unavailability, mismatch, recovery,
and cleanup remain distinct append-only states. The command-offer adapter does
not execute commands and cannot itself grant authority.
