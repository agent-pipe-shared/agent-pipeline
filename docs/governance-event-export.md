# Governance event export

Governance export is a one-way, non-authoritative projection. Without an
explicit destination policy, every destination and field is denied. A policy
can select only the closed safe field set from a validated canonical event; it
cannot permit raw payloads, human rationales, agent summaries, prompts, logs,
credentials, endpoints, certificates, or private coordinates.

Each projection receives a stable destination-neutral identifier derived from
the destination profile and canonical source event digest. Delivery receipts
contain only profile, policy revision, batch and acknowledgement state, cursor,
and lag. They do not prove retention, immutability, analyst review, compliance,
or any human/Pipeline authority. Export responses are never consumed as a
Pipeline authority source.
