# w8-export-view-validates-the-dispatch-evidence-assurance (held patch, not applied)

Cause of the red `critic-diagnostic-packet` suite (and the same defect behind the Critic host suites that build an export view): the local dispatch evidence a packet carries
now has an `assurance` field (`null` or `orchestrator-attested`) and a snapshot digest over it. The producer (`check-critic-skip-coverage`) and the packet preflight read that
form, but `validPacketBoundary` in `lib/critic-export-policy.mjs` still demanded the pre-assurance key set, so `deriveCriticExportView` returned `null` for a genuine
packet that has dispatch evidence. This is a product defect: a native Codex Critic could not get its export view.

Change: `validPacketBoundary` accepts both closed forms, exactly as `critic-packet-preflight` does: the current form (with `assurance`, restricted to `null` or
`orchestrator-attested`, digest over the field) and the older pre-assurance form (no field, digest without it) for packets claimed before the field existed. Any other key set,
value or digest is still refused.

Evidence (clean clone): `critic-diagnostic-packet` 2/2 (was 1/2), `critic-export-policy` 23/23, `codex-critic-packet-host` 4/4, `critic-claude-host` 20/20. Applies to the
repository HEAD.
