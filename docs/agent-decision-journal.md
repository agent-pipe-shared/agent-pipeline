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
