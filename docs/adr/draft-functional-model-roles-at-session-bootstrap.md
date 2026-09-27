# Draft: Functional model roles resolved at session bootstrap

## Status

Proposed on 2026-09-25. The PO confirmed the complete three-runner target
matrix on 2026-09-25 and clarified that Luna may also perform repository
writing. A functional `efficient` role is not intrinsically below the Mechanic
tier; a concrete model must be qualified for its writing duty.
This draft is not yet an operative
routing-policy record or approval of any exact model ID.

## Date

2026-09-25.

## Context

ADR-0031 requires one provider-neutral routing authority and generated runner
projections. The current `pipeline.runner-profiles.v3` registry and
`pipeline.user.v3` source still bind active routes to `alias` or `model-id`
selectors. A provider can rename a model or release a new generation without
changing the job the route serves. Updating concrete IDs throughout active
configuration is costly and risks a silent, mid-session capability change.

ADR-0006 excludes a genuinely below-Mechanic capability tier from
implementation and allows it only for read-only retrieval. The later PO
clarification does not classify every Luna generation as below Mechanic:
route-specific qualification, rather than a provider product name or a
session acknowledgement, determines whether a concrete model may write.

## Decision proposed

1. The governed route names a functional model role: `frontier` (difficult
   design/review), `worker` (normal implementation), or `efficient` (bounded,
   inexpensive work). These are capability/cost roles, not provider-family or
   product names. In particular, `efficient` must not be called `low effort`:
   reasoning effort is an independent field, so an efficient model can still
   need a careful task-specific effort setting. The policy explicitly maps
   each existing worktype and duty to one role and effort. Existing safety and
   Critic escalation floors remain in force.
   `efficient` may handle read-only fetch/extraction under MP-25 and bounded
   repository writing if the exact model and duty have been approved and
   verified at the Mechanic floor. A bootstrap acknowledgement cannot approve
   a model or relax that writing floor. Unknown or high-risk work still takes
   its independently required higher route.
2. Each Claude, Codex, and Antigravity adapter holds an approved, versioned
   mapping from role plus supported effort to concrete model IDs. The mapping
   records compatibility evidence and deterministic priority. Discovery of a
   newer or renamed provider model cannot approve it or change that priority.
   A new model first needs the applicable compatibility check and an explicit
   policy update under the existing authority ceremony.
3. At a genuinely new session bootstrap, the host combines the approved
   mapping with its observed available-model catalogue. It shows one compact
   readback for all configured runners: role, previous and selected exact model
   IDs, effort, policy identity, compatibility-evidence digest, selected
   session-receipt digest, bootstrap candidate, and whether the mapping
   changed. The acknowledgement digest binds those displayed receipt fields
   even if the selected model name itself stays the same. Added role slots and
   removed role slots are shown as changes too; an omitted slot must not
   silently disappear from the user's view. The host supplies the complete
   configured route set from its approved source and the resolver rejects any
   missing or extra route; a caller-authored list is not proof of that source.
   The user can inspect this
   once per new session; the first complete mapping needs one exact
   acknowledgement, while an unchanged approved mapping in later sessions is
   information, not a repeated confirmation or signature gate. A changed mapping asks for one
   explicit acknowledgement at the new-session boundary, after compatibility
   and policy approval. Admission binds that acknowledgement to the digest of
   the exact displayed mapping and the complete configured route set; a stale,
   partial or differently scoped confirmation cannot admit a changed mapping.
   The trusted host must record the actual
   human event. That acknowledgement is not an approval or signature and
   cannot itself authorize a new model.
   No available approved compatible model yields a typed unavailable result;
   there is no silent downgrade or cross-runner fallback. Multiple roles may
   intentionally resolve to the same exact model ID when the approved policy
   and role-specific compatibility evidence permit it.
   An unavailable compatibility check for a newly discovered model does not
   replace the previous approved selection: that model remains unapproved.
   The prior approved model can continue only when the host still verifies it
   is available for the route; if availability itself cannot be established,
   the route is explicitly unavailable rather than pretending that a cached
   receipt proves a fresh launch will work.
4. The host stores a trusted session receipt and binds every dispatch to its
   exact model ID, role, effort, session and mapping identity. Compact/resume
   reuses that receipt without refreshing the catalogue or switching the model
   mid-session. A receipt checksum alone is not proof of trusted storage or
   policy provenance; the host establishes both and checks the effective
   returned route before claiming conformance.
5. Registry, project source, runner projections, schemas and migration logic
   change together. Historical exact-ID decisions and evidence are preserved
   as history; the new selector takes effect for an installed runner only
   after its own complete route projection and host check. Product source
   covers all three runners, but a user repository needs only its chosen one;
   it need not install or authenticate the others. User repositories receive
   their own projected approved mapping, not an implicit selection from this
   repository's local installation.

Provider product names are deliberately absent from the governed role
vocabulary. The host must not infer `frontier`, `worker`, or `efficient` from
name fragments such as Opus, Sonnet, Haiku, Sol, Terra, Luna, Pro, or Flash:
providers can rename products, and one concrete model may satisfy more than
one role. Each runner's approved mapping must independently name the exact
model ID, role-specific compatibility evidence, supported effort and cost
envelope. A provider rename changes that versioned mapping, not the
functional role or a historical session receipt. Neither an available-model
catalogue nor the user's bootstrap acknowledgement is an automatic
"latest-by-name" approval or proof of account availability.

The PO confirmed the following task-to-role target on 2026-09-25. The stable
functional role is independent of provider product names. One concrete model
may intentionally fill more than one role; effort belongs to the task route,
not to a universal ranking of model families. `frontier` does not mean
"always use the provider's most expensive model".

| Stable task route | Claude role: current family / effort | Codex role: current family / effort | Antigravity role: current family / effort |
| --- | --- | --- | --- |
| Epic design and architecture | frontier: Opus / xhigh | frontier: Sol / xhigh | frontier: Pro / high |
| Feature design | frontier: Opus / high | frontier: Sol / high | frontier: Pro / high |
| Mini design | frontier: Opus / medium | frontier: Sol / medium | worker: Flash / high |
| Ongoing coordination and execution | frontier: Opus / medium | frontier: Sol / medium | worker: Flash / high |
| Ordinary implementation | worker: Sonnet / medium | worker: Luna / high | worker: Flash / medium |
| Bounded implementation and mechanical edits | efficient: Haiku / high | efficient: Luna / high | efficient: Flash / medium |
| Difficult implementation and guardrails | worker: Sonnet / medium | frontier: Sol / medium | worker: Flash / high |
| Test authorship | frontier: Opus / medium | frontier: Sol / medium | worker: Flash / high |
| Independent normal Critic | frontier: Opus / medium | frontier: Sol / medium | worker: Flash / high |
| High-risk Critic and security | frontier: Opus / max | frontier: Sol / max | frontier: Pro / high |
| Readiness | worker: Sonnet / high | worker: Luna / high | worker: Flash / high |
| Architecture and UX Advisor | frontier: Opus / max | frontier: Sol / max | frontier: Pro / high |
| Pure read, fetch and extraction | efficient: Haiku / medium | efficient: Luna / medium | efficient: Flash / medium |

The role is selected per task and runner, not permanently assigned to a
provider family: Flash serves both `worker` and `efficient` Antigravity
routes. This table is the PO-approved *task policy*, not evidence that each exact ID
is installed, compatible with its host transport or currently active. For
Antigravity, `Flash / medium` denotes the runner's medium model variant, not
an API-only `thinking_level` flag inferred for the CLI. The runtime keeps an
approved exact-model mapping with compatibility evidence. At a new session,
discovery of an additional model creates a proposed replacement for each
affected functional role; documentation and a model-name resemblance cannot
make the replacement effective. After route-specific compatibility, the PO
confirms the changed exact mapping once, and the host pins it for that
session. An unchanged mapping is shown without a repeat approval prompt.

Documentation check (2026-09-25): the official OpenAI model pages list
`gpt-6-sol` and `gpt-6-luna` with the requested reasoning-effort values.
Google's Antigravity CLI guide lists `gemini-3.8-flash-medium` as an actual
selectable CLI model variant. These sources establish documented selectors,
not account availability or measured success on this repository's routes.
The current V3 selectors are not silently rewritten from a documentation
observation alone. Sources:
<https://developers.openai.com/api/docs/models/gpt-6-sol>,
<https://developers.openai.com/api/docs/models/gpt-6-luna>, and
<https://codelabs.developers.google.com/antigravity-cli-hands-on>.

OpenAI family check (2026-09-26): its current model guidance lists GPT-6
`Astra`, `Sol`, and `Luna`; it does not list a GPT-6 `Terra`. The current
Codex model availability page continues to identify Terra as part of GPT-5.6
and describes it as the balance-of-cost-and-capability option. Therefore the
current exact GPT-6 route choices remain Sol and Luna; `Terra` is not a
GPT-6 successor candidate unless OpenAI publishes one and the normal
compatibility and PO-mapping process admits it. This records current upstream
nomenclature, not a promise that a provider will retain these product names.
Sources:
<https://developers.openai.com/api/docs/guides/latest-model> and
<https://help.openai.com/en/articles/20001354-gpt-56-and-gpt-6-pro-in-chatgpt>.

PO direction (2026-09-26): the task-quality gain of the GPT-6 family over
GPT-5.6 is valuable enough that a GPT-5.6 Terra route should not displace a
qualified GPT-6 Luna route merely to save cost. Keep Luna for suitable worker
and efficient duties; reserve Sol for duties whose additional capability
justifies its higher observed consumption. Further cost reduction is a
post-0.7 objective: measure task-level quality and consumption, then improve
routing, batching and avoidable review/verification work without silently
reverting the selected GPT-6 roles to GPT-5.6. This is routing direction, not
a claim that Sol's per-token cost or the measured plan-budget impact is
acceptable for every workload.

Post-0.7 measurement plan: use a small, repeatable set of representative tasks
with fixed inputs and acceptance criteria, and record the exact admitted role,
model and effort for every dispatch. Compare task completion and acceptance,
Critic finding severity and correction rounds, executed/reused verification
work, elapsed time, and observed provider-plan consumption where the runner
exposes it. Label unavailable or estimated usage as such; do not infer plan
quota or money from token counts alone. A routing or batching change is an
improvement only when it reduces observed consumption or avoidable elapsed
work without reducing accepted quality, required independent review, or
verification coverage. Keep the exact approved route snapshot stable during
each comparison, change one cost factor at a time, and retain a rollback to
the prior approved mapping. This work measures whether Sol's higher capability
is worth its observed consumption on each route; it does not assume that Sol
must be used for every task or that Luna is unsuitable for writing.

PO clarification (2026-09-26): an unchanged, concrete V3 `model-id`
selector is an approved *initial assignment* after its own role/effort
compatibility check passes; it does not need a second approval solely to
enter the functional-role scheme. A floating V3 alias is not an approval of
whichever exact model it resolves to later. Changed or newly observed exact
IDs still require the explicit model-policy decision. This clarification is
not itself evidence that the installed account can launch the selector.

Host-interface check (2026-09-26, preparatory evidence only): the installed
Codex app-server answered `model/list` with concrete Sol and Luna IDs plus
supported reasoning efforts; `agy models` returned concrete Flash and Pro CLI
variants. The official Claude Code model configuration documents the
`opus`/`sonnet`/`haiku` aliases and states that JSON results expose actual
models in `modelUsage`; Anthropic's `GET /v1/models` lists models available
to its **API credential**, which need not be the installed Claude Code OAuth
account. No Anthropic API key was configured for this check, and a minimal
tool-free Claude Code probe returned an expired-OAuth error with empty
`modelUsage`. Thus Claude host availability was not observed. Pure catalogue
parsers and a bounded, paginated API host fetcher fail closed on partial or
malformed input. An isolated tool-free Claude Code alias probe reports only
the exact model in a successful single-model `modelUsage` result. Neither
helper is yet a
trusted bootstrap producer or an approved route policy. Sources:
<https://code.claude.com/docs/en/model-config> and
<https://platform.claude.com/docs/en/api/models/list>.

## Consequences

The public routing vocabulary remains stable across provider renames, while
the exact model used by a session stays auditable. A newly discovered model
may remain unavailable until its compatibility and policy checks are complete.
The existing V3 exact-route contract needs an explicit migration rather than
a prompt-only reinterpretation of `alias` or `model-id`.

## Affected contracts

- ADR-0031 routing authority and generated projection rule.
- ADR-0006 implementation model floor, preserved for every writing route;
  Luna is not classified below it merely by product name.
- `pipeline.runner-profiles.v3`, `pipeline.user.v3`, runner mappings and
  routing drift checks.
- Claude, Codex and Antigravity bootstrap, dispatch and effective-route
  readback contracts; session/Compact receipts.
- The v4 dispatch-record writer and authorship verifier: both must validate a
  runner-aware approved model binding rather than assuming every Goldfish
  record names a Claude-agent frontmatter model. A record-local override or
  request-only model name must not attest the Agy execution.
- Model policy, Critic escalation and role-specific compatibility evidence.

## Required verification

For each runner: approved model selected at new bootstrap; unchanged mapping
shown without a repeated approval prompt; discovered unapproved model rejected;
offline Compact/resume retains the exact model; stale or forged receipt and
dispatch mismatch fail closed; unavailable role is typed; no cross-runner or
lower-role fallback; installed projection matches approved source. A model
rename must require a mapping/policy update, not a code change to the role
vocabulary. Candidate-bound checks and PO acceptance remain separate gates.
The Claude discovery regression starts with an older approved exact Opus ID
and an additional observed exact Opus ID. The latter appears as an unapproved
replacement candidate, never as an automatically selected route. After
compatibility evidence and an explicit policy update, a new session shows the
changed ID once for PO acknowledgement; Compact retains the old session's
receipt. A fixture can exercise this sequence, but an actual Claude-host
demonstration also needs a trusted account-level catalogue. Public model
documentation and the floating `opus` alias alone do not prove availability.
For an authored Agy v4 record, writer and verifier must accept the exact
approved, host-observed model plus consent/session binding and reject a forged
model, stale consent, missing observation or self-declared override.
