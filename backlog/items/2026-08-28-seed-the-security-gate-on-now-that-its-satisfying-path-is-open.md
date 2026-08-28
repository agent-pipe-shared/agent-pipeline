---
schema: pipeline.backlog-item.v1
id: pipeline.seed-security-gate-on
type: improvement
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — PO decision 2026-08-28: a fresh project starts with security on, and the scanners are installed alongside. The three reasons it was seeded off have all been closed; the remaining work is the manifest half."
source: "Measured 2026-08-28 against a genuinely fresh onboarded project at HEAD a304195d. Measured, not assumed — the same standard the original `off` decision was held to."
---

# Seed the security gate ON, now that its satisfying path is open

## The PO decision

A fresh project starts with `gates.security` on, and the external scanners are installed
alongside it rather than assumed present.

## What was measured, and what it replaces

`freshBaselines()` seeds `security: "off"`, and its comment gives three reasons. All three
were true when written and all three are now closed:

| | was | now |
| --- | --- | --- |
| 1 | `security-scan.mjs` refuses a dirty tree, and the push gate's own evidence dirtied it, because onboarding wrote no `.gitignore` | onboarding seeds ignore rules for `/evidence/`, `/scratch/`, `/project/pipeline-state.json` when the project owns no `.gitignore` |
| 2 | the license allowlist lived at a path that exists only in the Pipeline's own repository | the scanner falls back to plugin-shipped defaults resolved from its own on-disk location, never `rootDir` |
| 3 | measured verdict on a clean empty consumer: WARNING → exit 1 | measured verdict on a freshly onboarded project with real content: **CLEAN → exit 0** |

The exit-0 run: gitleaks and semgrep ran and reported 0 findings; osv-scanner and
license-check SKIPPED as `success` ("no package sources", "no declared
third-party-licenses.json") rather than failing. `toolchain-preflight.mjs` reports all six
tools `ready` on the measuring machine and carries `installCommand` / `installAttempted`
per tool, which is the mechanism behind "installed alongside".

## Why the one-line flip is wrong, and what the work actually is

Changing the calibration literal alone was tried and reverted. A test catches it, correctly:

```
assert.equal(gateConfig(parseYaml(freshManifestBytes()), "security"), null,
  "and the manifest must not carry one either -- the two must agree");
```

A calibration declaring a gate the manifest does not carry is the exact defect that test
guards — the same one `push` had. So turning security on means seeding the manifest's
security chapter too, and the manifest schema already admits one
(`pipeline-manifest.schema.json`, `security`).

The neighbouring push chapter sets the bar: a test asserts it names its own satisfying
command sequence out of its own refusal, because "the refusal reports the lifecycle state
but not the whole path". A security chapter has to do the same.

## Not to be done

Do not seed `warn`. `guard-push` evaluates security findings into the SAME failure list it
evaluates under the PUSH gate's mode, which is `blocking` — so a `warn` security gate
hard-blocks every consumer push while claiming to warn.

Do not adjust the two failing tests to match a new literal. Their property is right and
survives this change: a seeded gate must have an open satisfying path, and the calibration
and manifest must agree. Update what they assert about the WORLD, never relax what they
demand of it.

## Not claimed

That a machine missing the external scanners still passes. That case was not isolated: on
the measuring machine the scanners resolve from trusted locations even with them off
`PATH`, so the attempt to simulate their absence did not simulate it. Whoever implements
this should establish it properly — a fresh project on a machine with no scanners is the
case that decides whether "installed alongside" is a prerequisite or a promise.

## Acceptance criteria

- `freshBaselines()` seeds `security: "blocking"` AND the generated manifest carries a
  matching security chapter that names its own satisfying command sequence.
- The two existing tests are updated to assert the new world, with their properties intact:
  the gate's satisfying path is open, and calibration and manifest agree.
- A test measures the satisfying path end to end on a freshly onboarded project, the way
  the push gate's own satisfying path is measured today.
- The behaviour on a machine without the scanners is established and stated, not assumed.

## Related

- `2026-08-28-scanner-bootstrap-is-not-self-sufficient-for-a-fresh-project.md` — the work
  that closed reasons 1 and 2.
