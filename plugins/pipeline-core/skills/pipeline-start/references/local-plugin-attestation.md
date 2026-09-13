# Local plugin-attestation recovery

`plugin-attestation-required` protects a copied or cached local plugin when
the runner cannot prove which clean source checkout produced it. A missing
`nextAction` is deliberate in that case: do not treat the marketplace copy as
its own provenance authority and do not infer a source path from a prompt,
shell history, or a neighbouring checkout.

For Claude, an exact directory marketplace registration whose selected plugin
root is also the loaded root is a direct local-development source, not a copy.
It needs no receipt. If that direct-root case reports this status, the
registry/root identity is malformed or mismatched and must be repaired by the
installer or marketplace owner.

For a Claude cache or copied marketplace tree, the source-checkout owner must
run the source-bound host attestation command before bootstrap. Rerun the same
preflight afterward and continue only on `status: "ready"`. The command must
name a known clean source checkout and the actual installed root; never guess
either value. Antigravity copied registrations follow the same rule through
`install-agy.mjs` in that clean source checkout.
