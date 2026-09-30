# Private Critic export decision

Load when preparing private Critic export. Use the installed
`scripts/critic-export-consent.mjs --help` contract. Disclose the physical
project, declared provider/runner/service, approved source/evidence roots,
and excluded secrets/authentication/caches/transcripts/unrelated files once.
Record only the actual decision reference and digest against the displayed plan
digest. Normal candidate and evidence changes inside that scope reuse consent;
check and disclose exact paths/digests on each invocation without another PO
gate.

For the shipped native host, call `invokeCodexNativeCriticHost` from
`scripts/codex-native-critic-host.mjs` with a closed `exportContext` containing
`provider`, `service`, `hostGate`, `providerGate`, and `observedEndpoint`
(`null` if unknown). Declare provider `OpenAI` or `openai` explicitly,
matching the saved grant's label exactly; other providers do not select this
host's OpenAI route. Use the explicitly declared selected OpenAI/Codex service
and observed external gate values (`not-observed|approved|additional-check-required|denied`).

The host checks the saved physical-project decision and normalizes its
physically bound source/evidence records before any candidate-bearing child.
Retain the returned `exportConsent` disclosure with execution evidence. A
`consent-unavailable` failure names the detailed consent reason and proves no
child was created. Never substitute a source-project grant or a scratch
coordinator for this path.

Changed project, recipient or scope needs an amendment; revocation stops reuse.
The saved decision is attribution, never host approval. Preserve denied or
additional-check-required host status, never infer an endpoint from a model
label, and never request Full Access as a prerequisite for this mechanism.
