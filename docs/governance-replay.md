# Governance replay

`governance-replay` is a read-only, local reconstruction view for the
canonical lifecycle stream. It queries the verified stream boundary with an
optional retained checkpoint and projects only exact lifecycle envelopes into
per-dispatch timelines. An incomplete, prefix-valid, stale, or invalid stream
returns `unavailable`; it is never rendered as a partial authoritative history.

The replay is non-authoritative. It cannot approve work, restore a package,
replace a human decision, or repair canonical records. Candidate invalidation
and ordering are represented explicitly, so an uncorrelated candidate change
or sequence fork fails closed rather than being normalized away.
