# R2 route effort: dispatches honour the configured Claude route effort (held patch)

Slice W3-R2-ROUTE-EFFORT-C2-20261026 (continuation of C1). Candidate a574a7c207e4e905478ef36aa45703c679662f64.
Item: sprint-alfred-epic.2026-10-26-agent-frontmatter-effort-overrides-configured-route (AC-212).
Proposed commit message: fix(pipeline): take dispatch effort from the configured Claude route and refuse a contradicting agent pin

## Preimages (SHA-256 at the candidate) and postimages
- plugins/pipeline-core/scripts/dispatch-briefing.mjs: bb859021f060a63ec6c309d0ca7143d9b24c0a74dad43f5fc1b84fe450f258ba -> 2baf9de8adc78b55a770b9b754fb386810433df07b5dec76001f788f991f6aca
- plugins/pipeline-core/scripts/dispatch-briefing.test.mjs: d2abece3dc16e92491dc2aedad8f5e80e4173a74486cdebc01596b0914218ca9 -> 1cf9456aa0761786ad942c847c16491d6e1c9b3bcb2e6aa1193f59c996530abc

## Patch
specs/sprint-alfred-epic/evidence/held-patches/r2-route-effort.patch: a/ b/ repository paths, two files. `git apply --check` against the candidate: exit 0. Diffstat:
```
.../pipeline-core/scripts/dispatch-briefing.mjs    |   41 ++++++++-
 .../scripts/dispatch-briefing.test.mjs             |   94 ++++++++++++++++++++
 2 files changed, 132 insertions(+), 3 deletions(-)
```

## Design (generator-only, smaller blast radius)
Option chosen: the generator (scripts/dispatch-briefing.mjs) reads the Claude route of the agent type's duty (registry projection, read-only, lazily, only on the build/binding path, never on --help) and
- records the route effort in the binding and field 6 when the agent definition pin equals it;
- refuses typed DBG-EFFORT-ROUTE-CONTRADICTION before launch when the frontmatter effort differs from the route (the Claude Agent tool cannot pass an effort, MP-29, so the pin would silently win);
- admits an above-route pin only with --effort-escalation MP-05|MP-07 (warns DBG-EFFORT-ESCALATION, records the effort the run really gets); unknown act refused DBG-EFFORT-ESCALATION-UNKNOWN;
- an unreadable route warns DBG-EFFORT-ROUTE-UNKNOWN and keeps the briefed definition effort;
- a Codex dispatch never reads the Claude route.
Rejected: aligning agents/goldfish-*.md frontmatter with the route. It edits NEVER_LIFTABLE agent definitions and routing-authority/check-routing-projections would need a coupled change; it also removes the ability to keep a deliberately higher pin. guard-dispatch.mjs was not edited: refusal happens at briefing generation, the same point that already refuses a model contradicting its route (before launch).

## Counts (captured with capture-evidence.mjs under scratch/agent-out/w2-routing-effort/)
- Briefing suite, original generator + original test: RED/baseline red.log (new cases written first: 86 tests, 79 pass, 7 fail, the 7 being the new W2-R2 cases; plus the pre-existing help case).
- Briefing suite, patched work copy: 86 tests, 85 pass, 1 fail (exit 1) -> final-work-briefing.log
- Same with a neutral HOME: 86 tests, 86 pass, 0 fail (exit 0) -> final-work-briefing-homeneutral.log
- Routing-projection suite (check-routing-projections.test.mjs, one node test wrapping RP01-RP24 PASS lines): unmodified repository 1/1 green (exit 0). In the partial scratch copy the same file reports every RP line PASS except RP14 (committed projections match authority), which reads repository files absent from the partial copy; the suite neither imports nor touches dispatch-briefing.mjs, so the patch cannot affect it (fixture artifact, not a regression). Logs final-work-routing.log, final-repo-routing.log.
- Host check, unmodified repository plugins/pipeline-core/scripts/dispatch-briefing.test.mjs: 79 tests, 78 pass, 1 fail (exit 1) -> final-repo-briefing.log

## The one failing case is pre-existing and environmental
"public --help and -h work before setup without private reads, processes or filesystem effects" fails on the UNMODIFIED repository too (79 tests, 78 pass, 1 fail). Its audit hook forbids any fs call whose path starts with process.env.HOME; the checkout lives under HOME, so Node's ESM loader realpathSync of the script itself trips it before any generator code runs. It is independent of the patch (the new route reader is not on the help path) and passes when HOME does not prefix the checkout (see neutral-HOME count above). Not changed (existing case, QG-04).

## Reported, not changed
- Policy conflict: policies/model-policy.md MP-01 says high/xhigh for the Elephant while the PO config routes profiles.epic.execution_phase (claude) to opus/medium.
- routing-authority.json vs the runner profile registry: two sources describe routes; the patch reads the registry projection (functionalTaskRoutesForRunner) only.
- The build-package path does not carry --effort-escalation (only the binding CLI); a package-key addition is a separate protected-diff change.

## Conflicts with other held patches
Other held patches touching dispatch-briefing.mjs would conflict textually (same hunks around option parsing and the preflight block); apply this one in the bundled ceremony after `git apply --check` of each.
