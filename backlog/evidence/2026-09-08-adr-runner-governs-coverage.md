# Runner ADR Governs coverage

`NVA-B-ADR-GOVERNS-RUNNER-5` adds bounded ownership declarations to accepted
ADR-0035, ADR-0036, and ADR-0038. The machine-written terminal proof is
`scratch/NVA-B-ADR-GOVERNS-RUNNER-5/runner-governs-check.txt` (exit code 0).
It parses the exact headers, requires every target to be tracked, strips only
each Governs header before comparing the remaining body with `HEAD`, confirms
that the vendoring manifest declares none of these three ADRs, and uses the
read-only canonical status classifier from
`scratch/NVA-B-ADR-COVERAGE-STATUS-2/inventory.mjs`.

The current 80-row status inventory is 75 accepted, 3 historical, 1
provisional, 1 proposed, and 0 ambiguous. The classifier found no status or
category differences from the historical rows; its current source-row binding
digest is recorded in the capture. Source bytes are intentionally not claimed
equal to the historical 19-header snapshot. This slice brings accepted ADRs
with Governs headers to 28/75.

## ADR-0035 — Codex native normal Critic

The header covers the legacy host-duty registry and the current V3 route
registry/resolver, because `codex-critic-host.mjs` resolves the candidate-bound
`critic_normal` V3 duty while the accepted decision's original `criticNormal`
mapping remains in `routing-authority.json`. It covers the host's coordinator
implementation and direct test, its return and sanitized-receipt schemas, and
the current Codex sandbox compatibility policy, schema, implementation, and
direct test for the stated assurance/fallback boundary.

`codex-critic-host.mjs` binds the canonical root `roles/critic.md` and
`templates/prompts/critic-review.md` as review-contract inputs. Those root
sources are named rather than any generated plugin copies: changing only a
vendored copy would miss the authoritative content. The header does not claim
that current V3 model values rewrite ADR-0035's historical Sol/xhigh decision,
nor that the policy proves an effective model identity or OS isolation.

## ADR-0036 — runner-honest V2 contracts and usage

The frozen `runner-profiles-v2.json` registry, its validator and direct test,
and the `pipeline.user.v2` schema are the machine-readable mapping and source
contract ADR-0036 freezes. The runner-usage adapter and direct test plus the
runner-usage and usage-route-binding schemas own the explicitly described
in-memory native usage envelope and receipt correlation boundary.

The later migration CLI/module and runtime projections are intentionally not
listed. ADR-0036 assigns compiler, projection, migration, active configuration,
and their transaction behavior to later implementation packages; a header here
must not silently absorb those separate responsibilities. The header also does
not turn requested Terra into an observed effective model identity.

## ADR-0038 — runner-neutral V3 advisory route

The V3 registry, validator and direct test own the remaining frozen route and
fallback topology. The advisory receipt implementation, test, and schema own
the common sanitized receipt. The coordinator, direct test, host bridge, direct
test, and `consult-advisor` agent definition implement the bounded fresh
same-runner consultation composition that consumes the registered route.

ADR-0038 also still governs its explicitly stated activation and export
boundaries. The V3 source schema, owned-key manifest, runtime-projection module
and direct test, migration module and direct test, and migration CLI implement
the digest-bound `apply --activate` transaction and the runtime-before-source
ordering. The closed Critic-export allowlist is the V3 registry's
`criticExportPolicy`; `critic-export-policy.mjs`, its direct test, and the
receipt schema perform the pure packet/candidate/policy/provider/assurance
pre-export decision. That check records external host/provider gates without
turning either into a Pipeline approval.

ADR-0047 owns the later lifecycle trigger, model-free capability preflight,
demand, consultation-record, and mandatory-receipt semantics. Its
`advisory-lifecycle-v2` policy/module are therefore deliberately omitted from
ADR-0038's header. This preserves ADR-0038 as route authority without claiming
it still controls bootstrap triggering. The current registry remains named as
the registered route source without modernizing the ADR's historical model or
adapter decisions.
