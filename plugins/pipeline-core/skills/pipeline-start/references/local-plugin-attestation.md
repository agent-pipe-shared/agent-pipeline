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
either value. A gitless Claude cache or copied marketplace tree cannot recover
its clean Git source from the registry, so it returns
`plugin-attestation-required` with `nextAction: null`.

For Antigravity, the repository installer writes the receipt before it
registers a copied marketplace tree. Every gitless loaded Antigravity root
needs one exact path-registry binding plus the verified receipt. A missing,
ambiguous, or mismatched binding, or a legacy copied registration with no
installer locator, returns `plugin-attestation-required` with
`nextAction: null`. Run `install-agy.mjs` from the clean source checkout and
restart the runner as instructed by the installer. The source path cannot be
recovered safely from Antigravity's path-only registry and must not be guessed.
