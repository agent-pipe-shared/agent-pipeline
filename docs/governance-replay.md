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

## Local timeline and topology view

`governance-replay-viewer` turns a saved, verified replay readback into a new,
static offline HTML file. It renders each dispatch in sequence order and a
correlation topology of package, worker and attempt. `unknown` and
`unavailable` remain distinct states; an unavailable stream has no partial
timeline. The viewer accepts only the closed replay allowlist, rejects extra
event fields such as prompts, logs, credentials or private paths, uses a
network-denying Content Security Policy, and never overwrites a report.

```sh
node plugins/pipeline-core/scripts/governance-replay-viewer.mjs build \
  --root . \
  --replay evidence/governance-replay.json \
  --output evidence/governance-replay.html
```

The replay view is display-only. Cyborg's later proof of human authority must
be checked at its separate signed-authority boundary and, if shown here, remain
explicitly labelled as that verified fact; no lifecycle status or topology node
can imply it.
