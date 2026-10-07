# AC-33 recovery availability (RV-1..RV-11) - implementation design, 2026-10-08

Status: design note (Goldfish DESIGN-RV), not a Spec change. Answers the five open questions of
`plans/unstarted-ac-contracts-2026-10-07.md` section 2. Tags: **[D] derived** = the Spec text forces it (`spec.md`
line quoted); **[C] choice** = the Spec leaves room (two options, one recommended).

## Seams read (facts the choices rest on)

- `lib/worktree-lifecycle.mjs`: `inspectSessionOwnerRuntime` (705), `ORPHAN_ARCHIVE_OWNER_STATUSES` = unavailable|unobserved (948),
  `archiveOrphanSessionDescriptor` (1098: exclusive publish, byte readback, append-only audit, typed `WT-ORPHAN-ARCHIVE-*` codes,
  `mutated` flag). The file already holds six schema constants and a cleanup lock; it is large.
- `lib/session-cleanup-recovery.mjs` 962-966: V2 `ownerRuntime: null` is `unavailable`, V1 is `unobserved`.
- `lib/po-approval-proof.mjs` imports only `node:crypto`: `canonical()`, `createPoApprovalIntent` (`candidate` = two distinct OIDs),
  proof envelope `{schema,intentSha256,keyReference,publicKey,signatureBase64}`, Ed25519 over the UTF-8 hex intent sha.
  `human-guard-override.mjs` (3823-3875) builds on it; its default anchor is the repository's own
  `project/critical-human-proof.json`, which RV-8 forbids for the external route.
- `schemas/` holds `pipeline.<noun>.vN.json` plus `project-uninstall-journal.schema.json`; the orphan-archive audit/result
  schemas exist only as in-code constants.

## Q1. Name, location, packaging of the pinned built-ins-only external CLI

- [D] Standalone Node CLI, `node:` imports only, no install, no network, no part of the broken runner, plugin or in-session
  verifier (1107-1109). It cannot import `plugins/pipeline-core/lib/*`; it inlines the ~30-line proof recipe of
  `po-approval-proof.mjs`, pinned by a byte-equality test against that source.
- [D] The operator selects the artifact and the public signer anchor; trust comes only from that anchor (1110-1112).
  Arguments `--artifact --anchor --authorization --repo`; the anchor has no default.
- [C] Location. A: `harness/scripts/attended-recovery.mjs` (+ `.test.mjs`): inside the repo so QG gates cover it, outside
  `plugins/pipeline-core` so a broken plugin does not carry it; "pinned" = its sha256 is published in release evidence and the
  operator uses a copy from a known-good release. B: a release asset built from the same source. **Recommend A.**
- [C] Name `attended-recovery.mjs`: single file, no sibling imports; `run(argv, io)` exported for tests, thin `main()` for the shell.

## Q2. Formats: authorization, post-image artifact, journal

- [D] Detached human Ed25519 authorization binding repository identity, the exact bounded path set and each target's preimage,
  bytes or explicit absence (1115-1121). Preimages are owner-private, so the package binds `sha256`+`size` or `absent:true`,
  never bytes; forward-only recovery (1126-1128) keeps no preimage copies.
- [D] Reuse the proof envelope `pipeline.po-approval-proof.v1` and the `createPoApprovalIntent` shape with
  `kind: "attended-recovery"`, `subjectSha256` = sha256(canonical(package)). Package `pipeline.attended-recovery-package.v1`:
  `{repository, artifactSha256, entries:[{path, preimage:{state,sha256?,size?}, postImage:{sha256,size}}]}`, sorted by path.
- [C] Post-image carriage. A: bytes in the operator-selected artifact, one JSON bundle `pipeline.attended-recovery-artifact.v1`,
  whose sha256 the package binds (this makes "altered artifact" refusable, RV-8). B: bytes inline in the signed package. **Recommend A.**
- [C] Repository identity. A: git root-commit OID as `candidate.commit` with its tree (stable if HEAD moved during the incident).
  B: exact HEAD commit/tree as HGO does (any HEAD move voids the signature). **Recommend A.**
- [C] Journal `pipeline.attended-recovery-journal.v1`, append-only JSONL: `begin{packageSha256}`,
  `file-written{index,path,postImageSha256}` (after readback), `complete`. A: `.git/agent-pipeline/attended-recovery/<packageSha256>/`
  (existing private-state convention, outside the signed set). B: beside the artifact (survives repo damage). **Recommend A**, B only
  if the Git dir is unreadable.
- [D] Application per file (1122-1125): O_EXCL lockfile, CAS (preimage re-checked under the lock right before the write), atomic
  write (temp in the same directory, fsync, rename), readback equal to the signed post-image, then the journal record.
- [C] JSON Schema files `schemas/pipeline.attended-recovery-{package,artifact,journal,result}.v1.json`; CLI validation stays
  hand-coded (no ajv). **Recommend yes** (precedent: the uninstall journal schema).
- [D] Result `pipeline.attended-recovery-result.v1` `{status:"applied"|"resumed"|"refused"|"unavailable", code, prerequisite|null,
  mutated}`. RV-3..RV-6 custody reuses the envelope with `kind: "legacy-custody"` and package `pipeline.legacy-custody-authorization.v1`
  binding exactly the 1204-1206 list.

## Q3. Code/test paths the signed set may contain

- [D] Only "bounded code and test paths"; anything outside the signed set is refused (1116-1118). Excluded: State, runtime-private
  evidence, proofs, trust anchors, unrelated plugin configuration (1129-1131). The CLI enforces this in addition to the signature:
  a validly signed denylisted path is still `ATR-PATH-FORBIDDEN`. Paths are relative and normalized: no `..`, no `.git`, no symlink
  component (lstat each), no case/separator aliasing, no duplicate.
- [D] The route exists for code the in-session guards cannot edit, so the TP-1..TP-12 test files and the guard sources they cover
  must be admissible (agent-obligations section 2: no in-session override exists).
- [C] Breadth. A: allow `plugins/pipeline-core/{lib,hooks,scripts}/**/*.mjs` and `harness/scripts/**/*.mjs` (incl. `*.test.mjs`,
  TP-3 `verify.mjs`); hard denylist: State and `activeFeature` files (path list taken from their sanctioned writers at
  implementation time, not invented here), `evidence/**`, `.git/**`, `project/critical-human-proof.json` and any proof/anchor file,
  `.claude/**`, `hooks.json` (TP-4), `harness/verify-suites.json` (TP-13), `pipeline.user.yaml`. B: A minus the `hooks.json` and
  `verify-suites.json` denials. **Recommend A**: both are plugin configuration; the normal signed ceremony keeps them.

## Q4. RV-1..RV-7: `worktree-lifecycle.mjs` or a new module

- [D] RV-1 stays in `worktree-lifecycle.mjs`; vocabulary and tests (`worktree-lifecycle.test.mjs` 843, 1119) already live there.
- [C] RV-2..RV-6. A: extend `worktree-lifecycle.mjs`. B: new `plugins/pipeline-core/lib/legacy-owner-custody.mjs` importing the
  lifecycle primitives (export the private ones, one additive line in S3). **Recommend B**: one module per slice, and the
  lifecycle file already carries six schema families.
- [C] RV-7. New `lib/recovery-refusal-registry.mjs`: code -> `{rv, disposition, prerequisite}`; its test scans the custody module
  and the CLI source for `ATR-`/`WT-ORPHAN-` literals and fails on an unregistered one. Alternative: reuse an existing refusal
  registry if one exists at implementation time. Recommend the new registry.

## Q5. Typed codes RV-8..RV-11 (prefix `ATR-`; the names are [C], the refusal vs unavailable split is [D] by 1222-1241)

- RV-8 (refuse, zero mutation): `ATR-REPOSITORY-MISMATCH`, `ATR-ANCHOR-MISMATCH`, `ATR-SIGNATURE-INVALID`, `ATR-ARTIFACT-MISMATCH`.
- RV-9: `ATR-PATH-NOT-SIGNED`, `ATR-PATH-FORBIDDEN`, `ATR-PREIMAGE-MISMATCH`, `ATR-ABSENCE-MISMATCH`, `ATR-READBACK-MISMATCH`.
- RV-10: `ATR-JOURNAL-INVALID`, `ATR-LOCK-HELD`, `ATR-RESUME-DRIFT` (bytes are neither signed preimage nor post-image: preserve, no rollback).
- RV-11 (status `unavailable`, `prerequisite:{kind,action}` mandatory): `ATR-UNAVAILABLE-` + `OWNER-UNKNOWN`, `PROOF-MISSING`,
  `ANCHOR-MISSING`, `SOURCE-TRUST-MISSING`, `BYTES-AMBIGUOUS`, `HOST-UNSUPPORTED`.
- [C] Prefix `ATR-` vs reusing `WT-`: recommend `ATR-` (the standalone CLI cannot share the lifecycle error class; every code
  enters the RV-7 registry).

## Slice plan (QG-04: test-only commit, then fix; each slice <= 1 module; after R4, spec 1191)

Protected = TP-listed or needing the signed package. All new `*.test.mjs` below match no TP pattern, so they are ordinary files.

- S1 RV-1: extend `worktree-lifecycle.test.mjs` (verify what 843/1119 already pin); fix `worktree-lifecycle.mjs` only if red.
- S2 RV-7 scaffold: test `recovery-refusal-registry.test.mjs`, then `recovery-refusal-registry.mjs`.
- S3 RV-2 classify-only; S4 RV-3 proof binding; S5 RV-4 replay/archive; S6 RV-5+RV-6 readback, byte-identical State/proofs/history,
  forward-only: each a `legacy-owner-custody.test.mjs` then `legacy-owner-custody.mjs` pair.
- S7 RV-8 verify-only, no write path: `harness/scripts/attended-recovery.test.mjs` then `attended-recovery.mjs`.
- S8 RV-9 path set, preimage, apply, readback; S9 RV-10 journal and a crash at each of the four steps, injected through
  `run(argv, {hooks:{beforeStep}})`, never a CLI flag; S10 RV-11 every unavailable fixture names its prerequisite, registry
  completeness: the same pair as S7 each.
- S11 wiring: `harness/verify-suites.json` registration (TP-13: **protected, signed package / human**), CLI sha256 pin in release
  evidence, the four schema files (new, unprotected). No `hooks.json` change is designed.
- Protected paths in the whole plan: only `harness/verify-suites.json` (S11). The Q3 allow-list is what the CLI later applies to
  TP-listed files when it is the sanctioned writer.

## Choices for the PO (non-blocking question)

Most consequential: Q1 location (A `harness/scripts`), Q2 repository identity (A root commit), Q3 breadth (A, config files denied).
The remaining [C] lines (post-image carriage, journal location, schema files, module placement, registry, code prefix) carry a
recommendation and proceed unless the PO objects.
