# AGY-VERSION-EFFORT-CONTRACT-20261001

**1. Scope and outcome**  
Read-only preparation for `sprint-alfred-epic`, implementation revision 13, at HEAD `ccb6385f15baf3426236c5870740a430b90049a7`. Outcome: stop; official docs do not establish a safe production family/version/effort adapter.

**2. Primary sources**  
`https://antigravity.google/docs/models` lists Gemini 3.8/3.7/3.6 Flash and 3.1 Pro families and sample selector choices. `https://antigravity.google/docs/cli/headless/` documents `agy models`, exact model slugs via `--model`, separate `--effort low|medium|high`, and failure for unknown model slugs. `https://antigravity.google/docs/changelog?tab=cli` says effort controls exist and model support differs. These sources do not specify an identity or catalogue protocol.

**3. Family, release, and effort**  
The docs show same base model labels with multiple effort-labelled slugs; recorded catalogue output also contains high/medium/low IDs for Gemini 3.8, 3.7, and 3.6 Flash. That is evidence of observed IDs and a plausible variant relationship, not proof that the IDs are one release. Parsing slug suffixes, deriving family membership, or using name text to avoid `VERSION_AMBIGUOUS` would invent grammar. A future provider-authenticated bundle can explicitly bind family ID + release ID/version + canonical order to `{effort, exact model ID}` variants; this is a conditional schema target, not currently supported.

**4. Inventory and launch identity**  
Official `agy models` documentation says it lists available slugs, but gives no account/installation scope, completeness/freshness guarantee, pagination/terminal semantics, or release/selectability contract. The recorded observation was a completed command transcript without a native signed receipt. Docs support passing a slug verbatim with `--model` and fail-closed behavior for unknown slugs; they do not prove that this exact slug is an immutable release identity or attest the post-launch model.

**5. Effort and ordering evidence**  
The separate `--effort` flag is documented as a requested low/medium/high setting. Stream `init.model` documents the configured model when overridden; neither that nor argv proves effective execution. No official actual model/effort receipt contract, allowed-effort catalogue schema, canonical version grammar, or numerical release ordering was found. Until documented provider evidence supplies these, actual identity/effort and numeric ordering remain unknown.

**6. Stop conditions and remaining work**  
Required next evidence: authenticated complete account inventory semantics; canonical family/release/version IDs and numeric ordering; exact variant-ID and supported-effort mapping; trusted post-launch actual model and effort evidence. Do not activate Agy, invent a slug grammar, or reinterpret same-version IDs as one release yet. Gemini 4 Argon is absent from the recorded catalogue and checked overview only; global nonexistence is not claimed, and its per-PO target remains deferred. No native calls, tests, qualification, or Git changes were made. Machine-readable findings: `agy-version-effort-contract-research-20261001.json`.
