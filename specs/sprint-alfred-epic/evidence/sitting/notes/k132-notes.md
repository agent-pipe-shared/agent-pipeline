# K132-READER-INPUT-MIRRORS notes (ruleset 0.7.0+claude.20261022204428.79cda46, model sonnet)

Status: implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending.

## How the mirrors work (measured)
- No generator existed (confirmed by the comment in check-consumer-safe-paths.mjs and rg). Three byte-copy mirrors in plugins/pipeline-core/reader-inputs/ (inventory, governance, reader protocol),
  manifest.json (compact sorted-key JSON + 1 trailing newline, sha256 per input + policySha256 = hash of skills/reader-review/SKILL.md), pins in lib/doc-reader-documentation-snapshot.mjs
  (`inputHashes` constant + the manifest hash inside installedInputs(); that lib is a NEVER_LIFTABLE kernel path, line 775 of guard-maintenance-window.mjs).
- installedInputs() (plugin-installed mode only) checks manifest hash, per-input hash and byte equality against the PINS. It never compares a mirror with its source.
- In a SOURCE checkout the Reader snapshot hashes the source blobs of the candidate commit (sourceIdentity branch) and never reads the mirrors.
- No test pins the hashes or compares mirror and source. The one repo check that touches the mirrors is check-consumer-safe-paths (scans them, allowlist entries must all be used).

## ANSWER on steps 03/37 (measured with scratch/k132-measure.mjs)
- main (clone k132), k108 (state after 37), k108+38/39: inventory mirror != source, governance mirror != source (protocol mirror == source). installedInputs() PASSES in all three.
- The drift is OLDER than the sitting: the governance mirror equals the source at an old revision (d585b9c9e, before 11 later lines); the inventory mirror equals NO committed source revision
  (35 capabilities in both, but 10 capabilities differ in surfaceIds/evidence, and sourceBaseline). So steps 03 and 37 do NOT create a failing check and do not "require" a regeneration to stay green;
  the mismatch is pre-existing on main, nobody-noticed because no check compares mirror and source. They do widen it, and the K125 diffs widen it further.
- Consequence: a plugin installed from the sitting commits would present the Reader an old inventory/governance (installed Reader judges a different capability list than the source). That is the reason to regenerate.

## Deliverables (scratch/agent-out/)
- K132-helper-unprotected.diff (-U1, applies on main and on k108 chain): scripts/sync-reader-inputs.mjs + one row in docs/operating-tools.md. COMMITTED in clone k132: 478d09ab0 (feat(scripts), Dispatch trailer K132-READER-INPUT-MIRRORS (goldfish)).
  Usage: `node scripts/sync-reader-inputs.mjs [<root>] [--check]`; --check writes nothing, exit 1 names each drift; policySha256 constant only compared, never rewritten.
  Proven: with sources := committed mirrors the helper reproduces the committed manifest and pins byte for byte (scratch/k132-fmt.mjs, PASS).
- K132-mirrors-protected.diff (77 KB, 5 files): the 3 mirror files + manifest.json (reader-inputs/), lib/doc-reader-documentation-snapshot.mjs (2 pins), harness/scripts/check-consumer-safe-paths.mjs
  (+2 allowlist entries: shell-grammar-capability-placement.test.mjs, check-verify-case-completion-augmentation-policy.test.mjs; the new capability/surface content of the synced inventory quotes them;
  without them the checker fails "2 finding(s)", and stale entries fail too, so they must ride in THIS commit). That checker is not protected; it rides here for atomicity.
- K132-msg-protected.txt (trailers AI-Assisted: true / Dispatch: stage-0 (elephant)).
- New digests: inventory c005abd1..., governance a622c351..., manifest f68d5868...; protocol unchanged.

## Order and verification
- Order for the sitting: helper (unprotected, can land before) ... steps 01-37, 38, 39, K125 x3 (governance-reclass, inventory-architecture, test-assertion), THEN K132-mirrors-protected.diff as the last commit.
  Re-run `node scripts/sync-reader-inputs.mjs --check` after the last source change: any later edit of a source (including another rebaseline-inventory) makes the mirrors stale again.
- git apply --check clean in fresh clone k132-verify (k108 + 38 + 39 + 3x K125 + helper diff), then applied. Helper diff also --check clean on main.
- Direct `git apply` was fine here (no guard refusal); apply helper: scratch/k132-apply.mjs.
- Results in k132-verify (HEAD 21bd9773f, throwaway commit of the whole chain):
  - sync-reader-inputs.mjs --check: PASS
  - check-product-capability-inventory.mjs: exit 0, PASS
  - check-observation-governance.mjs: exit 0, 252 documents classified
  - node --test check-doc-contracts.test.mjs: 76 tests, 76 pass, 0 fail
  - node --test check-consumer-safe-paths.test.mjs: 9/9 pass; checker: 2175 files, 176 allowlist entries, all used (before the 2 entries: 2 findings)
  - check-doc-reader-binding.mjs --snapshot --candidate 21bd9773f... --feature-id sprint-alfred-epic: exit 0, docsetSha256 39f5549e57089ca2...; inputs equal the new mirror digests
  - installedInputs() in k132-verify: ok with the new digests (scratch/k132-measure.mjs)
- Same checks green earlier in k132-check (same tree before the final commit).

## Risks / open
- No test for the helper: a new test file needs registration in protected harness/verify-suites.json (check-verify-suite-registration), so none was added; coverage is the fmt proof above. Suggest a pin later.
- The inventory mirror was never a clean copy of a revision; first sync is a large diff (about 288 deletions/9 insertions before K125 = old content replaced). Review as a whole-file replace.
- Operator: the lib pin file is a kernel path; commit with the protected-source route. Ratchet effect (architecture/boundary-policy.json): none, no code paths added to plugins.
- Clones k132-check, k132-verify carry throwaway commits (never deliver them). k132 main clone is clean at 478d09ab0.
- Scratch helpers (main checkout, gitignored): scratch/k132-{probe,probe2,measure,fmt,dbg,apply,export}.mjs.
