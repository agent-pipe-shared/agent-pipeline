---
schema: pipeline.backlog-item.v1
id: pipeline.push-gate-unsatisfiable-in-consumer-deployment
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
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

## Related

- `2026-08-28-seed-the-security-gate-on-now-that-its-satisfying-path-is-open.md` — whose
  premise this corrects.
- `2026-08-28-scanner-bootstrap-is-not-self-sufficient-for-a-fresh-project.md` — the work
  that closed the earlier half of this; this is the part it did not reach.
- `2026-08-28-agents-talk-the-po-out-of-the-signature-instead-of-walking-it.md` — the same
  session, where the agent twice offered a bypass menu instead of this path.
