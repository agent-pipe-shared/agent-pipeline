# FOUNDATION-7 responsibility rationale

The four accepted decisions below retain their historical text. Their
`Governs:` headers identify current root-canon and direct enforcement sources;
they are responsibility declarations, not claims that every listed path is
already complete or conforming. Exact parser, fixed-body, tracked-target,
status-classification, and current-hash evidence is machine-written at
`scratch/NVA-B-ADR-GOVERNS-FOUNDATION-7/final-parser-capture-native-readiness.md` by
`node scratch/NVA-B-ADR-GOVERNS-FOUNDATION-7/check.mjs` (exit 0).

## ADR-0003 — role implementation and independent Critic

`docs/operating-model.md`, the three role contracts, the Goldfish/Critic
templates and checklists, and the three versioned agent definitions own the
current dispatch boundary: a bounded fresh Goldfish has no memory, while the
Critic is independent and read-only. `harness/review-protocol.md`, the
Critic skill, and the citation checker plus its direct test own the trigger,
input, isolation, and citation contract.

The T1 amendment remains an ADR-0003 responsibility after later transport
ADRs: the active Codex compatibility descriptor/schema and compatibility
module own selected-runner availability; Critic preflight and its direct test
bind the fixed candidate, paths-only inputs, and evidence. The current Claude
native path is explicitly declared through `critic-claude-host.mjs`, its direct
test, `critic-native-bare.mjs`, `critic-bare.mjs` and its direct test, plus the
shared verdict schema. They own the exact native-bare launch, fixed checkout,
route and JSON-verdict boundary; they are current adapter controls, not a
superseded historical mention.

The current Codex path is likewise explicit: the Critic host/direct test,
selected-host bridge, AppServer parent and child entrypoints, and the
sandboxed read-only bridge/direct test own selected-launch and result handling.
The receipt schema and isolated-contract module/direct test own the
functional-equivalent result, JSON-verdict, and fixed-input contract. These
entries preserve runner-native-first selection and the explicitly weaker
functional-equivalent assurance without asserting OS isolation or effective
model identity. Later transport ADRs own finer mechanism decisions; they do
not supersede ADR-0003's overarching selected-runner T1 requirement. Vendored
ADR copies are deliberately absent: the root ADR is authoritative and parent
owns the serial generator/check integration for its listed plugin destination.

## ADR-0004 — specification rigor and EARS

`docs/operating-model.md` defines the three current rigor shapes; the
Elephant role and dispatch checklist own triage and fixed six-field dispatch
construction. `templates/spec.md` owns the maintained specification shape;
the Goldfish and Critic templates make EARS criteria carry through execution
and review; `harness/definition-of-done.md` makes the criteria observable at
the delivery gate. The freshness-before-implementation obligation has direct
current owners: `readiness-reviewer.md` is the hard read-only role;
`spec-readiness-host.mjs` and its direct test bind the fixed candidate and
refs-only selected review; the sandboxed read-only bridge and direct test own
the selected transport and typed unavailable outcome. This is the current
spec-to-readiness-to-tests-to-Critic path.

No external CLI is listed because ADR-0004 rejected it. No generated plugin
template is listed as a source owner: the root template is canonical and its
copy is generation output. Other lifecycle machinery remains separate-owner
territory; it does not replace the decision's tier, EARS, or declared
readiness-before-implementation obligations.

## ADR-0005 — deterministic quality chain and two-part DoD

The project calibration selects the one verify command, and
`harness/scripts/verify.mjs` with its evidence writer owns deterministic local
execution and machine evidence. `.github/workflows/verify.yml` invokes that
same command in CI. `hooks.json` and `stop-suggest.mjs` own the current Stop
path; it is advisory, so it is declared rather than misrepresented as a
blocking verifier. `guard-push.mjs` and its direct test enforce fresh green
evidence at the delivery boundary.

`guard-testpath.mjs` and its direct test are included for ADR-0005's explicit
test-role separation. `guardrails/quality-gates.md`, the DoD document,
operating model, review protocol, Goldfish/Critic contracts, templates, Critic
skill, and the verify-evidence producer plus test complete the quality-chain,
two-part DoD, evidence, and judgment owners. The historical stop-hook wording
therefore has a concrete successor: the declared Stop hook now suggests, and
the declared verify/push/CI controls enforce the deterministic half.

The vendored ADR copy is generation output, not an independent source owner;
parent owns its serial regeneration and byte-identity check.

## ADR-0006 — capability tiers, projection, and telemetry

`policies/model-policy.md` remains the capability and effort authority;
`pipeline.user.yaml` and `routing-authority.json` are the declared routing
inputs. The operating model, role contracts, review protocol, templates, and
agent definitions own how those tiers are selected, recorded, and escalated.
`runner-profiles-v3.json` and its reader/test, V3 runtime projection and test,
and V3 drift checker and test own the runner projections and fail-closed drift
surface. The routing checker and schema make those projections checkable.

The agent-model registry and dispatch-policy modules with their direct tests
own dispatch-record/default versus explicit-override treatment. The
runner-usage module, direct test, and schema own the ADR's telemetry fields
and binding. They distinguish a requested mapping from observed route evidence;
this declaration makes no effective-model assertion. Receipt-specific and
runner-transport mechanisms remain separately owned by their later ADRs, but
their separate ownership does not narrow ADR-0006's enduring capability,
projection, mismatch, and telemetry obligations.

## Validation and integration boundary

`check.mjs` compares every exact declaration with the final source headers,
requires every target to match at least one tracked path, rejects duplicate
targets, strips only the header and proves every remaining byte against
`58f0a2e262750b021543adac5a9e9643de030e6b`, and reuses the canonical status
classifier against all prior status rows. Its final pass reports local `4/4`
only; it deliberately does not assert a parallel-sensitive global coverage
total. No vendored generator, generated plugin copy, runtime, policy, schema,
checker, or test was changed by this task. Parent owns the serial vendored
generation and final integration checks for ADR-0003 and ADR-0005.
