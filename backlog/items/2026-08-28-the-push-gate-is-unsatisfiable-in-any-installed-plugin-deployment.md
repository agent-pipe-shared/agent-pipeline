---
schema: pipeline.backlog-item.v1
id: pipeline.push-gate-unsatisfiable-in-consumer-deployment
type: defect
owner: pipeline
status: closed
created: 2026-08-28
closed_at: 2026-08-29
closure_repository: self
closure_commit: af9ce953240cc3f224cf2c1b3f5bea4ac6d9711a
closure_evidence: backlog/items/2026-08-28-the-push-gate-is-unsatisfiable-in-any-installed-plugin-deployment.md
sprint: nova
done_when: manual
tracking: "NOW / Nova A — happy-path blocking, and the most severe finding of the day: a correctly-signed push cannot land in ANY consumer deployment. Also blocks the security-gate-ON decision, whose measurement was taken in the one environment where this defect does not fire."
source: "Consumer project HA, session 56 (2026-08-28, Windows). The PO explicitly chose the signature route, the ceremony ran correctly end to end, the PO signed -- and the push still could not land. All three mechanisms below were then verified in this repository's own code before filing."
---

# The push gate cannot be satisfied in any installed-plugin deployment

## What happened

The PO chose the signature route deliberately, over the agent's objections. The ceremony
then worked: `prepare-push-subject` → `authorize-critical` → the PO signed → `approve-push`
recorded `Push approved by "Andre" for commit 8c11c505`. The S55 `path.relative()` bug did
not fire this time, even with the key on `C:` and the repo on `D:`.

The push still could not land. Three separate defects, each verified here in code.

## (a) gitleaks can never find its config outside the Pipeline's own checkout

`security-adapters/gitleaks.mjs`:

```js
const GITLEAKS_CONFIG_PATH = pathJoin(dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..", "..", ".gitleaks.toml");
```

Resolved from the adapter module's own on-disk location. The module's own
`coverageLimitations` states the consequence plainly:

> "A plugin-only distribution/marketplace install (no repo root, no .gitleaks.toml
> alongside it) will not have the file at the resolved path; run() detects this
> explicitly ... **still blocking-class, same fail-closed exit-code policy**"

And a comment above it calls the fix "an open item, not solved here". So this is a known,
documented, deliberately-deferred limitation — whose actual effect is that **the security
evidence can never be green for any consumer that installs the plugin** rather than
running from this repository's checkout. That is every consumer.

Measured at HA: 0 findings across all scanners, exit 2. Not a security finding — two
adapters that cannot start. `semgrep` is the second: it refuses `--config auto` because
metrics are off.

### Ruled out: "it was Windows, the scanner probably just was not installed"

Raised as an alternative reading and checked rather than argued. It does not hold, and it
is the error itself that rules it out, not an inference:

- The classification is `config_missing`. The adapter has a separate path for an absent
  binary (its own install probe, returning `{installed: …}`); this is not it.
- The path in the message is `D:\Dev\agent-pipeline-local-marketplace\.gitleaks.toml` —
  the marketplace root, which is exactly what the four-levels-up resolution computes from
  the module's location.
- The check runs before the spawn. The function's own doc comment: "returned by `run()`
  **BEFORE it ever spawns gitleaks**".

**But the objection exposes a real unknown, precisely because of that third point.** Since
the config check short-circuits ahead of the spawn, HA's gitleaks *installation* status
was never established — the config error masks it. So this item may claim the config was
missing; it may not claim the scanners were present. That matters, because the
security-gate decision rests on the promise that the scanners are "installed alongside",
and this run is not evidence for it.

One positive data point on the other side: **semgrep did run.** It exited 2 with a genuine
semgrep message (`Cannot create auto config when metrics are off`), which only a started
binary produces. At least one scanner was therefore installed on that Windows machine,
which is evidence the toolchain install works there.

## (b) `push-prepare` ignores `gates.security` entirely

HA's `pipeline.user.yaml` carries `gates.security: "off"`. The evidence was demanded
anyway. Verified in `scripts/push-prepare.mjs`:

```js
checks.push(checkEvidenceFreshness("verify-evidence", VERIFY_EVIDENCE_DEFAULT_PATH, dir, headCommit, deps));
checks.push(checkEvidenceFreshness("security-evidence", "evidence/security-latest.json", dir, headCommit, deps));
```

Unconditional. The file's own header comment claims it "additionally runs for
`evidence/security-latest.json` **when a security gate**" — the comment describes an
intent the code does not implement. Either turning the gate off has an effect, or it does
not; both cannot be true.

## (c) The evidence circle, and why it is a true dead end after signing

Both producers write into `evidence/`. Untracked, those files dirty the working tree that
`authorize-critical` — and `push-prepare`'s own `working-tree-clean` check — require
clean. Committing them moves the candidate commit, which invalidates the signature that
was just produced for the previous one.

HA resolved this once, for `verify-latest.json`, by adding a `.gitignore` entry and
committing it — which was possible only *before* signing. When the security scan then
wrote three more artifacts, the same circle reappeared **after** the signature, where no
commit is permitted. There is no exit from that state.

Onboarding does seed ignore rules for `/evidence/`, but only when the project owns no
`.gitignore`. HA owned one. So every existing repository adopting the Pipeline walks into
this.

## What this does to the security-gate-ON decision

`2026-08-28-seed-the-security-gate-on-now-that-its-satisfying-path-is-open.md` records a
measurement showing a fresh project scanning CLEAN at exit 0, and concludes the satisfying
path is open. **That measurement was taken inside this repository's own checkout**, which
is the one environment where (a) does not fire. It is not evidence about a consumer, and
that item's own "Not claimed" section already warned that the no-scanner case had not been
isolated — this is the same blind spot, one step further out.

The order therefore matters: (a) and (b) must land BEFORE the gate is seeded on. Seeding
`security: "blocking"` first would be honest about intent and still leave every consumer
unable to push.

Note that (b) means consumers are *already* in this state regardless of their gate
setting. Turning the gate on does not create the breakage; it removes the illusion that
the setting is what governs it.

## Direction

1. Resolve the gitleaks config against the PLUGIN's own shipped location so an installed
   deployment finds it, or ship it inside the plugin package. Absent a config, return
   `SKIPPED` rather than `ERROR` — `osv-scanner` and `license-check` already do exactly
   that, so the precedent is in the same codebase.
2. Make `push-prepare` respect `gates.security`, so the setting means what it says.
3. Break the evidence circle at the source: the producers' output paths must be ignored by
   construction in every project, not only in one that arrives without a `.gitignore`.
   A project that already owns one must have the entries added.
4. `semgrep`'s `--config auto` needs a configuration that does not depend on metrics being
   enabled.

## Acceptance criteria

- A project that installed the plugin (no Pipeline checkout anywhere) produces green
  security evidence, or a `SKIPPED` that does not block.
- `gates.security: "off"` demonstrably removes the security-evidence requirement from
  `push-prepare`; a test asserts both settings.
- Running the full push path end to end never leaves the tree dirty in a way that forces a
  commit after a signature. A test drives the post-signature state and asserts no producer
  output can require one.
- Measured against an installed-plugin deployment, not against this checkout. The whole
  finding is that those two differ.
- The config check no longer masks the installation probe: a run states, separately,
  whether the binary is present and whether its config resolved. Today one answer hides
  the other, which is why this session could not establish whether gitleaks was installed
  on the consumer machine at all.

## Progress, 2026-08-29 (dispatch NVA-R25-PUSHGATESAT)

Parts (a), (b), and (d) of Direction were found ALREADY FIXED by prior dispatches
earlier in this same session, before this dispatch's briefing was written --
re-verified fresh here rather than re-implemented (CLAUDE.md's re-verify-before-
dispatching-on-an-inherited-claim rule, applied on discovery):

- **(a) gitleaks config resolution:** `resolveGitleaksConfigPath()` (`gitleaks.mjs`)
  now tries the repo-root `.gitleaks.toml` first, then falls back to a
  plugin-shipped default (`plugins/pipeline-core/config/security/gitleaks-default.toml`),
  degrading to `SKIPPED`/`classification: "success"` only if neither resolves --
  committed `867d287a` (`fix(security): resolve gitleaks config in an installed-plugin
  deployment`, NVA-J-GITLEAKSCONFIG). The binary-presence check (`resolveBinary`) now
  runs BEFORE the config-path check in `run()`, so `binary_missing` and a missing
  config are already two distinguishable signals -- closing this item's own "config
  check masks the install probe" gap without further rework. `gitleaks.test.mjs`:
  23/23 pass, including an explicit "installed-plugin fixture with no repo root
  anywhere" case.
- **(b) push-prepare respects `gates.security`:** `isSecurityGateActive()`
  (`push-prepare.mjs`) reads the effective `gates.security` mode via the shared
  `gateConfig()` reader and mirrors `guard-push.mjs`'s own activation rule;
  `checkEvidenceFreshness("security-evidence", ...)` is pushed onto the checks list
  only when the gate is active. The header comment already states this accurately.
  Committed `37443e91` (`fix(push-prepare): gate the security-evidence check on
  gates.security mode`, NVA-J-PUSHPREPGATE). `push-prepare.test.mjs`: 43/43 pass,
  including both `gates.security: "off"` and `"blocking"` asserted directly.
- **(d) semgrep `--config auto` metrics dependency:** `buildAdapterConfig()`
  (`security-scan.mjs`) now always supplies a real `rulesDir` for semgrep -- the
  project's own `security.scanners.semgrep.rules_dir` when configured, else a
  plugin-shipped default ruleset (`plugins/pipeline-core/security/semgrep/pipeline.yml`)
  -- so the real push path never falls through to semgrep.mjs's own `"auto"` literal.
  `semgrep-default-rules.test.mjs`: 7/7 pass, a genuine live invocation of the real
  `semgrep` binary present in this environment against exactly that shipped ruleset,
  with `SEMGREP_SEND_METRICS: "off"` in its env -- no metrics-off failure.

This dispatch made no code changes to the adapters or `push-prepare.mjs`; it re-ran
the tests above fresh (all green) plus this item's own required verify command
(`check-consumer-safe-paths.test.mjs`, 9/9) against the current tree, then recorded
this note. **Part (c) remains OPEN**, blocked on a concurrent dispatch
(NVA-R24-TRUSTANCHOR) owning `lib/project-onboarding-v3.mjs` -- `status` stays `open`
for that reason alone.

## Related

- `2026-08-28-seed-the-security-gate-on-now-that-its-satisfying-path-is-open.md` — whose
  premise this corrects.
- `2026-08-28-scanner-bootstrap-is-not-self-sufficient-for-a-fresh-project.md` — the work
  that closed the earlier half of this; this is the part it did not reach.
- `2026-08-28-agents-talk-the-po-out-of-the-signature-instead-of-walking-it.md` — the same
  session, where the agent twice offered a bypass menu instead of this path.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** close
- **Rationale:** re-verified 2026-08-29: commits `867d287a` (gitleaks config
  resolves in an installed-plugin deployment), `37443e91` (`push-prepare`
  gates security-evidence on `gates.security` mode), `e3bf10e8` (scanner
  shipped under `plugins/pipeline-core`), `92d1b711` (scanner defaults ship so
  a fresh project can scan at all), and `af9ce953` (onboarding asks about an
  owned `.gitignore` missing evidence-circle entries, closing part (c)'s
  dirty-tree-after-signing dead end) are all present in the current tree.
  `project-onboarding-v3.test.mjs` passes 154/154 including the owned-
  `.gitignore` evidence-circle coverage.
- **Date:** 2026-08-29
