---
schema: pipeline.backlog-item.v1
id: pipeline.seed-security-gate-on
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
done_when: "contains plugins/pipeline-core/lib/project-onboarding-v3.mjs security: \"blocking\", claude_md_max_lines: 200"
tracking: "NOW / Nova A — PO decision 2026-08-28 stands, but BLOCKED: the measurement below was taken in this repository's own checkout, the one place the consumer-side defect does not fire. See 'Correction' before implementing."
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

## Correction (2026-08-28, same day): reason 2 is not closed for a consumer

The table above records reason 2 as closed because "the scanner falls back to
plugin-shipped defaults resolved from its own on-disk location, never `rootDir`".
**Resolving from the adapter's own on-disk location is precisely the mechanism that
fails** for any project that installed the plugin rather than running from this
repository's checkout: `GITLEAKS_CONFIG_PATH` walks four directories up to a repo root
that does not exist there, and the adapter's own `coverageLimitations` says so and calls
the fix "an open item, not solved here".

Consumer project HA hit exactly this: 0 findings across all scanners, exit 2, because two
adapters could not start. Full analysis, with the two further defects that came with it,
in `2026-08-28-the-push-gate-is-unsatisfiable-in-any-installed-plugin-deployment.md`.

The measurement in this item is not wrong — it is not evidence about a consumer. It was
run inside this checkout, where `.gitleaks.toml` exists. This item's own "Not claimed"
section already flagged that the missing-scanner case had not been isolated; this is the
same blind spot one step further out, and the honest reading is that the satisfying path
was verified in the one environment where it is open.

**Ordering consequence, which changes what this item may do:** the gitleaks resolution
and `push-prepare`'s disregard for `gates.security` must both land BEFORE the gate is
seeded on. Seeding `security: "blocking"` first would be honest about intent and still
leave every consumer unable to push.

## Acceptance criteria

- `freshBaselines()` seeds `security: "blocking"` AND the generated manifest carries a
  matching security chapter that names its own satisfying command sequence.
- The two existing tests are updated to assert the new world, with their properties intact:
  the gate's satisfying path is open, and calibration and manifest agree.
- A test measures the satisfying path end to end on a freshly onboarded project, the way
  the push gate's own satisfying path is measured today.
- The behaviour on a machine without the scanners is established and stated, not assumed.
- The satisfying path is measured against an INSTALLED-PLUGIN deployment, not against this
  repository's own checkout. The correction above exists because those two differ, and only
  the second was ever measured.

## Landed, 2026-08-29 (dispatch NVA-R33-SECGATEON, commit `bb2b9ed7`)

`freshIntent()` seeds `security: "blocking"` (never `"warn"`, per the item's
own "Not to be done"). The manifest's `DEV_PLAN_BLOCKING_GATE` chapter
carries a matching `security` section, `type: "automated"` (no separate
human approval — the scan itself produces the evidence), naming
`security-scan --root .` as its own satisfying command out of its own
refusal, mirroring the push chapter's existing discipline. New test
`SECGATE-1` measures the satisfying path end to end: refuses a push with
missing security evidence, admits it after the shipped scan command runs.
The two prerequisite fixes this depends on (gitleaks config resolution for
installed-plugin deployments, `push-prepare` respecting `gates.security`)
were independently confirmed already landed before this dispatch started.

Re-verified independently by the Elephant (this dispatch hit its 80-turn
limit mid-task and never wrote its own final report, so this note is from
direct code/test inspection, not a trusted self-report):
`project-onboarding-v3.test.mjs` 152/152 (was 151), including SECGATE-1;
`check-consumer-safe-paths.test.mjs` 9/9.

**Acceptance criteria status:**
- Seed + matching manifest chapter: done.
- Two existing tests updated to assert the new world: done (part of the
  152/152 diff, not individually re-confirmed line-by-line).
- Satisfying-path-end-to-end test: done (SECGATE-1).
- Behavior on a machine without scanners: stated via code comment and
  covered by the existing `deriveReportStatus()` SKIPPED-status mechanism,
  not by a fresh isolated measurement in this dispatch (the item's own
  "Not claimed" section already noted this is hard to truly isolate on the
  measuring machine).
- Measured against an INSTALLED-PLUGIN deployment specifically: **not
  done** — the new test runs against this repository's own checkout, the
  same limitation the item's own "Correction" section flagged for the
  original measurement. Left `status: open` for this reason.

## Measured, 2026-08-30 (dispatch NVA-CF-SECGATEMEASURE) — installed-plugin measurement now done, result is FAIL

The remaining gap above is now genuinely measured, not just reasoned about.
Ran `security-scan.mjs --root .` from the actual installed plugin cache
(`~/.claude/plugins/cache/agent-pipeline/pipeline-core/0.5.4/`, an
independent on-disk copy with no `.git`/`.gitleaks.toml` in its own path)
against a real installed-plugin consumer project
(`Rune_Test1_Agy_060_76`, `gates.security: "blocking"` from its own earlier
onboarding, unmodified for this measurement):

```
gitleaks: OK [success] (0 findings)
osv-scanner: SKIPPED [success] (0 findings) -- no package sources
semgrep: ERROR [scanner_error] -- "Cannot create auto config when metrics
  are off. Please allow metrics or run with a specific config."
license-check: SKIPPED [scanner_error] -- allowlist not found
Verdict: BLOCKING -> exit 2
```

**Root cause: version skew, not a missing fix.** Gitleaks' config-resolution
fix (`867d287a`) IS present and working in the installed 0.5.4 cache. But
the plugin-shipped-default-fallback logic for semgrep's `rules_dir` and the
license-check allowlist (NVA-B-SCANNER / NVA-R18-SCANBOOT) landed in this
repo's source tree AFTER 0.5.4 was cached — this repo's `VERSION` currently
reads 0.6.0-in-progress. The fix exists in source; it has not yet reached
the artifact a real consumer actually has installed.

**Staying open.** The satisfying path is not yet confirmed working for any
real consumer today. Expected resolution path: once the 0.6.0 candidate is
stamped and the local plugin cache is refreshed to it (this session's own
planned end-of-sprint step), re-run this exact measurement against the
refreshed installed cache. If it then passes, close with that evidence; if
it still fails, the gap is real and needs its own fix, not just a stamp.

## Related

- `2026-08-28-scanner-bootstrap-is-not-self-sufficient-for-a-fresh-project.md` — the work
  that closed reasons 1 and 2.
- `2026-08-28-the-push-gate-is-unsatisfiable-in-any-installed-plugin-deployment.md` (closed
  2026-08-29) — fixed both prerequisites this item's own "Ordering consequence" section
  named as required first: gitleaks config resolution for installed-plugin deployments
  (commit `867d287a`) and `push-prepare` respecting `gates.security` (commit `37443e91`),
  measured at a real installed-plugin consumer (HA). This item's own remaining gap
  ("measured against an INSTALLED-PLUGIN deployment specifically") is now more tractable
  given that fix, but has not itself been re-measured for the SECURITY gate's own
  satisfying path specifically (only for the push-prepare wiring) — still not done, noted
  here so a follow-up dispatch does not have to re-discover this cross-reference.
