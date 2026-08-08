# CB-1a measurement note — the push threat-model binding as it exists today

Read from code before any production file was changed. Line numbers are as of
the commit this note is added on top of.

## M-1 — what `boundRepositoryArtifact` requires of the artifact

`plugins/pipeline-core/scripts/pipeline-state.mjs:2561-2576`:

```js
function boundRepositoryArtifact(dir, relativePath) {
  const root = realpathSync(resolve(dir));
  const path = resolve(root, relativePath);
  if (relative(root, path).startsWith(`..${sep}`) || !path.startsWith(`${root}${sep}`)) {
    return { ok: false, code: "CRITICAL-PROOF-BOUND-ARTIFACT-PATH" };
  }
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > EXTERNAL_PUBLIC_ARTIFACT_MAX_BYTES) {
      return { ok: false, code: "CRITICAL-PROOF-BOUND-ARTIFACT-UNSAFE" };
    }
    return { ok: true, path: relativePath, sha256: sha256Bytes(readFileSync(path)) };
  } catch {
    return { ok: false, code: "CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE" };
  }
}
```

- **Existence**: required. A missing path (or any `lstatSync` throw — permission
  denied, ENOTDIR, etc.) refuses with `CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE`.
- **Location**: `relativePath` is resolved against `realpathSync(resolve(dir))`
  and must stay lexically inside that root (`relative()` must not start with
  `..`, and the resolved path must start with `root + sep`). Any path that
  escapes `dir` — including via `..` segments or an absolute path outside it —
  refuses with `CRITICAL-PROOF-BOUND-ARTIFACT-PATH`. **This containment is the
  load-bearing constraint**: the artifact must live *inside the project
  directory `approve-push` is invoked against*, not merely somewhere readable.
- **File shape**: must be an ordinary file (`stat.isFile()`), must NOT be a
  symlink, and must be ≤ `EXTERNAL_PUBLIC_ARTIFACT_MAX_BYTES` (1 MiB). Any
  violation refuses with `CRITICAL-PROOF-BOUND-ARTIFACT-UNSAFE`.
- **Tracked / committed**: **not checked at all.** The function only calls
  `lstatSync`/`readFileSync` on the working-tree path. An untracked,
  uncommitted, or `.gitignore`d file that happens to sit at that path and pass
  the checks above is bound exactly as readily as a long-committed one. (This
  differs from `readPushApprovalMode`/`committedBytes` in
  `critical-human-proof-policy.mjs`, which *does* require the working copy to
  match `HEAD` — that stricter check is not reused here.)
- **Refusal codes**: `CRITICAL-PROOF-BOUND-ARTIFACT-PATH` (escapes `dir`),
  `CRITICAL-PROOF-BOUND-ARTIFACT-UNSAFE` (not a plain small file / is a
  symlink), `CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE` (missing or unreadable).
  `approve-push` (`:5197-5198`) surfaces whichever code verbatim and refuses
  the whole command.

## M-2 — every place the `{path, sha256}` pair travels

1. **Produced** — `boundRepositoryArtifact(dir, PUSH_THREAT_MODEL_PATH)`,
   `pipeline-state.mjs:5197`, called inside the `approve-push` case, *before*
   the request/authority/signature are read.
2. **Enters the signed subject** — `pipeline-state.mjs:5199-5202`:
   `threatModelBinding = { path: threatModel.path, sha256: threatModel.sha256 }`
   is placed into `subject.threatModel` and passed to
   `verifyCriticalHumanProof(...)`, which (at `:2623`) calls
   `criticalActionSubjectSha256({ kind, candidate, subject })` — the pair is
   now baked into the digest the human's Ed25519 signature covers
   (`lib/critical-action-approval-request.mjs:29-35`).
3. **Persisted in State** — `pipeline-state.mjs:5218`:
   `approvalRecord = { ..., threatModel: threatModelBinding }`, written into
   `project/pipeline-state.json` as `pushApproval.lastApproved.threatModel`.
4. **Re-verified at push time** —
   `lib/critical-action-authorization.mjs:252-282` (`authorizeRecordedPush`):
   reads `approval.threatModel` **from the persisted State record**, not from
   any constant, then calls `boundArtifactDigest(projectDir, approval.threatModel.path)`
   (`:97-110`) — a **second, independent implementation** of the same
   containment+hash logic, rooted at `projectDir` (the repository actually
   being pushed) — and refuses (`PUSH-PROOF-THREAT-MODEL`) unless the
   re-computed digest still equals the recorded one. It then rebuilds the same
   `subject` shape and re-derives the expected digest via the *same*
   `criticalActionSubjectSha256` (`:171-179`) to check against the signed
   action.
5. **Request-preparation time (outside pipeline-state.mjs)** —
   `docs/push-release-flow.md:102-109` documents that *the agent* computes
   `--subject-sha256` by hand, before any of the above runs, using
   `criticalActionSubjectSha256({kind, candidate, subject})` with
   `subject.threatModel` filled in from the same fixed
   `specs/sprint-nova-epic/.../critical-action-authorization-threat-model.md`
   path and its current hash. This is a **third** site that must agree, and it
   is documentation-driven, not code-shared with either of the above.

## M-3 — does the human side (`po-human-approval.mjs`) independently reconstruct the pair?

**No — it treats the subject digest as an opaque, externally-supplied value.**
`po-human-approval.mjs`'s `prepare-critical`/`approve-critical`/`authorize-critical`
subcommands take `--subject-sha256 <sha256>` as a plain CLI argument
(`po-human-approval.mjs:31` usage string; validated at `:229` as "64 lowercase
hex chars", nothing more). Grepping the file for `threatModel`, `PUSH_THREAT_MODEL`
or any file-hashing logic mirroring `boundRepositoryArtifact` returns nothing —
the script has no knowledge of the artifact at all. It signs whatever digest it
is handed.

This means `po-human-approval.mjs` itself has **no independent reconstruction
to go out of sync** — it cannot diverge from `pipeline-state.mjs` because it
never computes the pair in the first place. **No stop-condition trigger on M-3
as scoped** (the two sides named in the briefing — `pipeline-state.mjs`'s
`approve-push` verification and `po-human-approval.mjs`'s signing — do not
derive the subject differently; only one of them derives it at all).

**Adjacent finding, reported because it bears directly on whether this change
works end to end, not because it is M-3 itself:** the value handed to
`po-human-approval.mjs` as `--subject-sha256` is computed by *the agent*,
by hand, per the documented recipe in `docs/push-release-flow.md:102-109` —
which hardcodes the same `specs/sprint-nova-epic/...` path this task removes
as a default. `docs/push-release-flow.md` is outside this task's edit scope.
After this change, an agent following that document verbatim in a *consumer*
project would still try to hash a file that does not exist there, and would
never produce a `--subject-sha256` that matches what `approve-push`'s
verification step (now resolving the artifact differently) expects. Fixing
`pipeline-state.mjs`'s resolution alone does not close this gap; the
preparation-time recipe needs the same resolution logic, in a task that can
touch `docs/push-release-flow.md`. Flagged under Open items in the final report.

## M-4 — what a reader can conclude today from the fact that a push proof carries this hash

**One sentence:** a recorded push proof's `threatModel` hash tells a reader
that the human's Ed25519 signature was made over a subject that includes the
exact byte-for-byte content of *some file that existed inside the pushed
project's own directory tree at approval time*, at the recorded path, with no
guarantee that file was ever committed to version control — only that its
current bytes on disk, when re-hashed at push time via
`boundArtifactDigest(projectDir, path)`, still match what was signed (any edit
after signing invalidates the binding and the push guard's
`PUSH-PROOF-THREAT-MODEL` refusal is what enforces that).

This is the property that must not silently change: **"the artifact lived
inside the pushed project's own tree, and the human's signature is bound to
its exact current bytes."** It says nothing about the artifact being tracked,
reviewed, or the same document across two different approvals for two
different commits — only that whichever bytes the human's signature covers
are the bytes still on disk when the push guard checks.
