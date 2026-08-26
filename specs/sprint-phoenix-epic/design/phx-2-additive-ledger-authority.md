# PHX-2: an additive external ledger check for `guard-push.mjs`

> Design only. No code in this document has been implemented. Baseline: main's
> `gates.push_approval` mechanism ([ADR-0056](../../../docs/adr/0056-push-approval-mode.md))
> stays exactly as it is; this design adds one more thing a push must satisfy, it does
> not touch what ADR-0056 already checks.

## 0. Why this document exists

The `origin/main` 0.5.2 merge into `sprint_phoenix` (commit `75b8361`) resolved
`plugins/pipeline-core/hooks/guard-push.mjs` to main's implementation. Pre-merge, Phoenix's
own version additionally called `checkLedgerPushAuthority(sourceCommit)`
(`plugins/pipeline-core/hooks/guard-push.mjs` at commit `998a609`, line 604) before honoring a
push. That function read a strict `pipeline.push-approval.v2` projection out of local state,
then shelled out to `plugins/pipeline-core/scripts/governance-authority.mjs` (a 103-line CLI,
also at `998a609`) for a `--consumption-readback-json` call against
`plugins/pipeline-core/lib/human-governance-ledger.mjs` — PHX-1's append-only,
hash-chained, checkpointed, cross-platform-locked, recoverable governance-event store. That
whole store, plus its Recovery Bridge / feature-package / continuity-authority-revision
machinery, is `harness/scripts/pipeline-state.mjs` and `harness/lib/plan-spec-state-v2.mjs`
pre-merge (see backlog item
`backlog/items/2026-08-07-ledger-backed-plan-and-push-authority-absent-on-merged-base.md`,
findings 1, 2, 4, 5, 6, 11). The PO decision recorded there is binding and is not
re-litigated here: main's `gates.push_approval` stays the baseline; PHX-2 becomes an
additive layer "consumed alongside the signature/chat gate, not a competing enforcement
path." (§1 states exactly which of the two modes this specific design actually engages for —
read §1 before assuming both are covered.)

This document designs the smallest such additive layer. It reuses main's existing
`authorizeRecordedPush` / `criticalProof` machinery for everything about verifying *that a
human cleared this push*, and adds only what that machinery structurally cannot provide:
single-use consumption state that lives outside the Git-tracked, resettable repository.

## 1. What guarantee is actually being added

Read this section before the rest — it sets the ceiling for what follows, and the honest
answer is smaller than PHX-2's original ambition.

**What ADR-0056 already provides.** In `signature` mode, `guard-push.mjs` rebuilds the
subject digest of the push and verifies a detached Ed25519 signature against a committed
trust anchor (`authorizeRecordedPush`, `plugins/pipeline-core/lib/critical-action-authorization.mjs:224`).
The agent is *cryptographically incapable* of producing that proof — the private key lives
outside the repository. That is already a strong, external, single-use guarantee: single-use
because `state.criticalProofConsumption` (written atomically alongside the approval by
`pipeline-state.mjs approve-push`, `plugins/pipeline-core/scripts/pipeline-state.mjs:5189-5210`)
refuses to let the same `proofSha256` authorize a second push
(`authorizeRecordedPush`, same file, line 273-277).

**What is NOT already provided, and what this design adds.** The existing single-use check
lives entirely inside `project/pipeline-state.json` — a mutable, Git-working-tree file. Two
concrete residual gaps follow from that:

1. **Git-level replay.** Nothing about `criticalProofConsumption` survives `git checkout`
   to an earlier commit of that file, a fresh `git worktree add`, or a fresh clone that
   predates the consumption write landing in a commit (the state file is typically
   uncommitted local state — see this repo's own convention of keeping it dirty). An agent
   or a tooling accident that resets or recreates the working tree can, in principle, put
   `criticalProofConsumption` back to a state that has not yet consumed a given proof, while
   the proof itself (still recorded in `pushApproval.lastApproved.criticalProof`) still
   verifies. ADR-0056's own text documents one prior incident of exactly this class of bug
   (the anchor-path-scoping fix, "measured, not theorised: the fixtures exited 0" — ADR-0056
   §"The anchor is read from the governing session"). A second, independently stored
   consumption marker that does not live in the Git working tree at all cannot be reset by
   any Git operation, so a bug or accident that resets or forges the *local* ledger no
   longer suffices by itself.
2. **`chat` mode's stated honesty gap.** ADR-0056 §4 says plainly that in `chat` mode "the
   only thing separating a genuine clearance from a fabricated one is that the human runs
   the approval command" — there is no cryptographic distinction between the human and the
   agent invoking `pipeline-state.mjs approve-push` from the same shell. This design does
   **not** close that gap. No purely local, single-machine mechanism can, because both the
   human and the agent have access to the same command in the same session; genuinely
   proving human presence needs an out-of-band channel (a second device, a physically
   separate credential), which is explicitly outside "smallest additive mechanism" and is
   not proposed here. The gap this design leaves in `chat` mode is stronger than "no added
   strength," though — see the coverage-boundary paragraph immediately below.

**Coverage boundary: this design engages ONLY for `signature`-mode-configured projects.**
The read-side integration point (§2) is nested inside the branch of `guard-push.mjs` that
executes only when `pushGate.approval === "required"` and no `push` waiver applies
(`!pushWaiver.waived`). `gates.push_approval: chat` sets exactly that waiver
(`criticalProofWaiverFor`, `plugins/pipeline-core/lib/critical-human-proof-policy.mjs:270-280`
resolves `waived: true` whenever `configured.mode === "chat"`) — as does an explicit
ADR-0055 waiver for `push` recorded in the critical-human-proof policy. Whenever `pushWaiver
.waived` is true, that entire branch is skipped and this design's new check is never
consulted at all, in either direction: not on the read side (nothing calls
`checkExternalPushLedgerConsumption`) and not on the write side (`approve-push`'s
`verified.proof !== null` guard, §2, is also false for a waived approval, since `chat` mode
produces no `criticalProof` object to bind a `proofSha256` to in the first place). Concretely:
**`chat`-mode-configured projects get zero benefit from this design — not weaker
defense-in-depth, none at all — until a follow-up design extends coverage.** Extending
coverage to `chat` mode is not a natural, small extension of the mechanism in §3: the external
ledger is keyed on `proofSha256`, and a `chat`-mode approval has none, so there is nothing to
bind a consumption record to. A `chat`-mode-specific keying scheme (e.g. binding on
`forCommit`/`remote`/`destination` instead) would also need to invent single-use semantics
`chat` mode does not have even locally today — `criticalProofConsumption` is never appended
for a waived approval (`pipeline-state.mjs:5208-5210`), so nothing today stops the same `chat`
approval from being reused, meaning "single-use consumption" is not yet a concept that applies
to a `chat`-mode approval at all. Building that concept is materially more than "smallest
additive mechanism" calls for and is left to a follow-up design, not attempted here.

**Stated plainly, as required:** the marginal guarantee this design adds is a *second,
independently stored, independently checked, single-use consumption record that is immune to
Git-level state manipulation* — defense-in-depth against a bug or reset in the existing local
enforcement chain, and available **only to `signature`-mode-configured projects** per the
coverage boundary above. It does **not** add a new proof of human identity or presence beyond
what `signature` mode's private key already provides, and it does **not** apply to `chat` mode
in any form, weakened or otherwise. A fully adversarial agent session with unrestricted
filesystem access (including outside the repository) is not defended against by this design
either — see §6.

## 2. Exact integration point

### Read side: `plugins/pipeline-core/hooks/guard-push.mjs`

Current structure (§(c) approval, starting line 1598): when `pushGate.approval === "required"`
and no waiver applies, the guard calls

```js
const attested = authorizeRecordedPush({
  projectDir, anchorDir: fallbackProjectDir(), state,
  candidate: { commit: sourceCommit, tree: sourceTree },
  remote: pushBinding.remote, destination: pushBinding.destination,
  now: new Date().toISOString(),
});
```

at line 1660-1668, and pushes a failure if `!attested.authorized`.

The new check is added as an **additional, AND-ed condition inside the same `if
(pushGate.approval === "required" && !pushWaiver.waived)` branch**, evaluated only after
`attested.authorized` is true (there is nothing to consume-check if the base signature proof
did not already verify). Per §1's coverage boundary, this is also exactly why this design
engages only in `signature` mode: `!pushWaiver.waived` is this branch's own precondition, and
`chat` mode is precisely the condition that makes it false, so the branch — and this design's
check inside it — never runs at all for a `chat`-mode-approved push:

```js
if (!attested.authorized) {
  failures.push(/* existing message, unchanged */);
} else if (externalPushLedgerGate(manifest) !== "off") {   // new: opt-in, see §5
  let repository = null;
  try {
    repository = discoverRepository(projectDir);  // worktree-invariant roots, see below
  } catch {
    // discoverRepository throws on >=7 paths (missing/symlinked start path, git spawn
    // failure/non-zero exit incl. WT-GIT-SPAWN, submodule/`--separate-git-dir` common-dir
    // shape, missing primary root -- worktree-lifecycle.mjs:163-169,231-249). This file has
    // no ambient try/catch around this integration point, and per hooks.json's own exit-code
    // contract (0 allow, 2 block, 1 allow+warn), an UNCAUGHT throw here exits the process at
    // 1 -- which this hook's own harness treats as ALLOW, silently discarding every other
    // already-accumulated failure in `failures`. This catch is the fail-closed disposition
    // that replaces that uncaught-throw path; see §4's new read-side entry.
    failures.push(
      "External push ledger repository topology could not be resolved "
      + "(PUSH-EXTERNAL-LEDGER-TOPOLOGY-UNRESOLVED). Push refused -- this is a fail-closed "
      + "disposition, never a silent pass-through and never an uncaught throw.",
    );
  }
  if (repository !== null) {
    const ledgerCheck = checkExternalPushLedgerConsumption({
      repositoryFingerprint: derivePoGateRepositoryFingerprint({
        gitCommonDir: repository.commonDir,
        primaryRoot: repository.primaryRoot,
      }),
      proofSha256: state.pushApproval.lastApproved.criticalProof.proofSha256,
      candidate: { commit: sourceCommit, tree: sourceTree },
    });
    if (!ledgerCheck.ok) {
      failures.push(
        `External push ledger consumption is ${ledgerCheck.code}. Record it with: `
        + "node harness/scripts/pipeline-state.mjs approve-push ... "
        + "(the same command that already records pushApproval now also writes this).",
      );
    }
  }
}
```

`discoverRepository` (`plugins/pipeline-core/lib/worktree-lifecycle.mjs:231`) is imported, not
newly written — but it is a **net-new import at both integration points**, not an existing one
reused from elsewhere: `guard-push.mjs` does not currently import it (confirmed: no reference
to `worktree-lifecycle.mjs` anywhere in that file today), and neither does `pipeline-state.mjs`
— that file's only import from `worktree-lifecycle.mjs` today is `inspectSessionClosure`
(`pipeline-state.mjs:321`), not `discoverRepository`. Both files need a new import line added.

Its `primaryRoot`/`commonDir` pair is the physical primary checkout, resolved the same way
regardless of which worktree the guard happens to be running from. This is not a stylistic
choice, but it also does not mean `discoverRepository()` is "the one universal primitive" every
fingerprint call site in this codebase already funnels through — it is one of **two related,
independently implemented primitives**. Five real call sites genuinely do feed
`derivePoGateRepositoryFingerprint` directly from a `discoverRepository()` result's
`.commonDir`/`.primaryRoot` — `document-adapter.mjs:99`, `document-binding.mjs:120`,
`governance-event-store.mjs:87` (via a fail-closed wrapper), `document-identifiers.mjs:106`,
`session-power.mjs:312`. A second, distinct primitive, `resolvePoGateRepositoryTopology()`
(`po-gate-authority.mjs:336-377`), independently re-derives a similar worktree-invariant
topology via its own git spawns — it is not built on top of `discoverRepository()` and does not
call it. At least four real call sites feed `derivePoGateRepositoryFingerprint` from *that*
primitive's `gitCommonDir`/`primaryRoot` output instead: `po-gate-profile-publisher.mjs:197-200`
(via `resolveTopology`, defaulting to `resolvePoGateRepositoryTopology`, `po-gate-profile-
publisher.mjs:81,181`), `po-gate-authority.mjs:484` (nested inside `validatePoGateProfileSnapshot`,
itself fed `resolvePoGateRepositoryTopology`'s output at its call site, `po-gate-authority.mjs:387,
408`), and two call sites an earlier draft of this paragraph omitted entirely —
`setup.mjs:1226,1238-1241` and `codex-advisory-bootstrap.mjs:93-94`. Both primitives are
worktree-invariant in the same way (neither uses a worktree-local toplevel), so the direction of
this design's F1 fix is unaffected either way — but this design deliberately uses
`discoverRepository()` specifically, for a self-contained fingerprint-input calculation at a
read/write pair that does not need `resolvePoGateRepositoryTopology()`'s broader topology object
(registered worktree roots, worktree list) — not because it is the only primitive that exists,
and not because either `guard-push.mjs` or `pipeline-state.mjs` already imports it.
Using `projectDir`
(`fallbackProjectDir()`'s `git rev-parse --show-toplevel` from whichever worktree the push
runs in — `plugins/pipeline-core/hooks/guard-push.mjs:748-754`) or the CLI's own working
directory (`dir` in `pipeline-state.mjs`) instead would make the fingerprint itself vary
between worktrees of the same repository: a proof consumed against worktree A's fingerprint
would not match a check made from worktree B, which directly undermines §1 point 1's
worktree-invariance claim — the exact threat this design exists to close would remain open
because the new check's own key would be worktree-dependent.

What it needs from the caller beyond the repository roots above: exactly the fields
`authorizeRecordedPush` already computed for its own check — `sourceCommit`, `sourceTree`
(already resolved earlier in the same file via `resolveSourceTree()`, line 1657), and
`state.pushApproval.lastApproved.criticalProof.proofSha256` (already present on `state`, no
new field is added to `pipeline-state.json`). The new check therefore consumes exactly the
same `criticalProof`/`subjectSha256` binding main already produces — it does not re-derive or
re-verify the signature, only checks that its `proofSha256` has an external, independent
consumption record.

### Write side: `plugins/pipeline-core/scripts/pipeline-state.mjs`, `case "approve-push"`

Immediately after the existing local write (line 5204-5215, the `writeState(dir, next,
base)` call that persists `pushApproval` and `criticalProofConsumption`), and only if that
local write succeeded, add one call:

```js
if (verified.proof !== null && externalPushLedgerGate(dir) !== "off") {
  let repository;
  try {
    repository = discoverRepository(dir);  // same worktree-invariant roots as the read side
  } catch {
    // Same >=7-path throw surface as the read side (worktree-lifecycle.mjs:163-169,231-249).
    // Per this block's own placement above ("immediately after the existing local write ... and
    // only if that local write succeeded"), this catch can only fire AFTER
    // `writeState(dir, next, base)` (line 5213) has already succeeded -- so
    // `pushApproval.lastApproved` and `criticalProofConsumption` for this `proofSha256` are
    // already persisted by the time this specific catch fires. That gives this sub-case the same
    // state consequence as the write-side sub-cases below (§4): a naive retry with the same
    // proof hits the pre-existing `CRITICAL-PROOF-REPLAY` guard (line 5196-5199), so recovery is
    // not "just retry." An uncaught throw here would not be silently treated as allow the way
    // the read-side hook's exit code is (Node's default uncaught-exception handling exits the
    // CLI process non-zero on its own), but it would still be an unstructured crash instead of
    // the explicit, named `approve-push refused (<CODE>)` disposition every other failure in
    // this command produces. Give it the same name and shape as the read side:
    console.error("Error: approve-push refused (PUSH-EXTERNAL-LEDGER-TOPOLOGY-UNRESOLVED).");
    return 2;
  }
  const appended = appendExternalPushLedgerConsumption({
    repositoryFingerprint: derivePoGateRepositoryFingerprint({
      gitCommonDir: repository.commonDir,
      primaryRoot: repository.primaryRoot,
    }),
    proofSha256: verified.proof.proofSha256,
    consumedAt: approvedAt,
  });
  if (!appended.ok) { console.error(`Error: approve-push refused (${appended.code}).`); return 2; }
}
```

The two `discoverRepository(...)` calls above should also carry an explicit `timeout`, matching
the `5000`ms convention `guard-push.mjs` uses uniformly across all 20 of its existing git spawns
(e.g. `guard-push.mjs:427-430` and `guard-push.mjs:750-753`, both `5000`ms). `pipeline-state.mjs` has
no equivalent uniform convention to match instead: it has seven `spawnSync` git calls today
(lines 1592, 1593, 2096, 2540, 2551, 2675, 2685), five of which pass no `timeout` at all; of the
two that do, only `2675` is conditional (`args[0] === "ls-remote" ? 30_000 : 5_000`) and `2685`
is unconditionally `5_000`ms -- so "this file's own established `5000`ms" is accurate only for
`guard-push.mjs`, not for `pipeline-state.mjs`. As of
the current `worktree-lifecycle.mjs`, though, this is not simply a matter of passing
`{ timeout: 5000 }`: `runGit`'s `options` parameter forwards only `cwd`, `env`, `encoding`,
`maxBuffer` and `shell` to the underlying `spawnSync` call (`worktree-lifecycle.mjs:110-125`) --
no existing caller of `discoverRepository` anywhere in this codebase passes a `timeout`, and none
would be honored today even if one did. Meeting a timeout convention therefore needs a small,
disclosed extension to `worktree-lifecycle.mjs`'s shared `runGit`/`gitText` helpers (forwarding
an `options.timeout` through to `spawnSync`) as part of implementing this design, not merely
invoking a capability that already exists. The recommended numeric value for both new call sites
is `5000`ms, matching `guard-push.mjs`'s established convention for consistency across the two
integration points -- not because `pipeline-state.mjs` already has such a convention (it does
not), but so both files converge on the one convention that does exist in this codebase -- unless
the implementation dispatch finds a reason to diverge; the exact wiring is left to that dispatch.

`gitCommonDir`/`primaryRoot: dir` (the CLI's raw working directory) are replaced with the same
`discoverRepository(dir)` call the read side now uses, for the identical reason: `dir` is
whatever directory `pipeline-state.mjs` was invoked from, which is worktree-local exactly like
`guard-push.mjs`'s `projectDir`, and a fingerprint keyed on it would not match across
worktrees. `verified.proof !== null` mirrors the existing conditional at line 5208 exactly (a
`chat`-mode waiver still has no `criticalProof` object to bind a `proofSha256` to, so there is
nothing to externally consume in that branch — see §1's coverage-boundary paragraph for why
this is a disclosed scope limit, not an oversight).

## 3. What is reused vs. what is new

**Reused, unchanged:**

- `authorizeRecordedPush` / the whole `criticalProof` verification path
  (`plugins/pipeline-core/lib/critical-action-authorization.mjs:224`) — the new check never
  re-verifies a signature; it only checks that an already-verified proof's `proofSha256` has
  an external consumption record.
- `criticalActionSubjectSha256` / `criticalActionSha256`
  (`plugins/pipeline-core/lib/critical-action-approval-request.mjs:29,45`) — no new binding
  vocabulary; `proofSha256` is the existing field.
- `derivePoGateRepositoryFingerprint` (`plugins/pipeline-core/lib/po-gate-authority.mjs:212`)
  — the existing repository-fingerprint primitive is reused as-is rather than inventing a
  second fingerprint scheme (PHX-2 pre-merge invented its own `repositoryFingerprint` concept
  inside the governance-event ledger; that duplication is exactly what this design avoids), fed
  by `discoverRepository(...)`'s `primaryRoot`/`commonDir`, matching every other call site (see
  §2).
- `discoverRepository` (`plugins/pipeline-core/lib/worktree-lifecycle.mjs:231`) — the existing
  worktree-invariant repository-discovery primitive, reused to compute the fingerprint's inputs
  at both call sites (§2); a net-new import at **both** — `guard-push.mjs` imports nothing from
  `worktree-lifecycle.mjs` today, and `pipeline-state.mjs` imports only `inspectSessionClosure`
  from that module today (`pipeline-state.mjs:321`), not `discoverRepository`. See §2's
  correction of this point for the related, distinct `resolvePoGateRepositoryTopology()`
  primitive some other fingerprint call sites use instead.
- The `pipeline-state.mjs approve-push` CLI subcommand as the **sole** write path — no new
  CLI, no new subcommand. One more atomic file write is added to the existing command.
- The GS-1 gate-strength protection already covering the whole `pipeline.user.yaml` file
  (`plugins/pipeline-core/hooks/guard-gate-strength.mjs`) — the new opt-in key
  `gates.push_external_ledger` (§5) lives inside that already-protected file, so it inherits
  existing write-lane *and* shell-lane protection against an agent silently turning the new
  gate off, with zero new guard code.
- `state.planApproval.poGateAuthority` / `state.activeFeature.id` / main's continuity
  machinery — **not touched, not read, not duplicated.** The external ledger entry carries no
  feature or plan identity at all (see §6): it is scoped to exactly `repositoryFingerprint +
  proofSha256`, which is sufficient to answer "was this proof already consumed" and nothing
  more.
- The shape of `criticalProofConsumption` entries (`{ proofSha256, kind, consumedAt }`,
  `pipeline-state.mjs:5210`) — the external entry mirrors this shape rather than inventing new
  field names.

**Genuinely new (small, and this is the entire net-new surface):**

- One new lib module, `plugins/pipeline-core/lib/external-push-ledger.mjs` (estimated
  80-150 lines), exporting two functions:
  - `appendExternalPushLedgerConsumption({ repositoryFingerprint, proofSha256, consumedAt,
    rootDir = homedir() })` — writes `{ schema: "pipeline.external-push-ledger.v1",
    repositoryFingerprint, proofSha256, consumedAt }` to
    `join(rootDir, ".pipeline", "push-ledger", repositoryFingerprint, `${proofSha256}.json`)`.
    Because §5 establishes that on first use in any given repository the target directory
    (`.pipeline/push-ledger/<repositoryFingerprint>/`) does not exist yet, the write is two
    steps, not one: first `mkdirSync(dirname(path), { recursive: true, mode: 0o700 })`, then
    `writeFileSync(path, json, { flag: "wx", mode: 0o600 })`. Without the `mkdirSync` step the
    very first `approve-push` in any repository would throw `ENOENT` (the parent directory is
    missing), not the `EEXIST` the single-use design below assumes — `mkdirSync` with
    `recursive: true` is idempotent against an already-existing directory, so this is safe to
    call unconditionally on every write, not only the first. The `wx` flag on the file write
    itself remains the single-use mechanism: it throws `EEXIST` if the file already exists, so
    a second write for the same `proofSha256` fails atomically at the filesystem layer — no
    lock file, no hash chain, no append-only stream, no recovery journal is needed, because
    each proof gets exactly one file and that file is never appended to or rewritten — with one
    disclosed, narrow caveat: this atomicity guarantee assumes `rootDir` resolves onto a local
    filesystem. On a non-local filesystem (most concretely a network-mounted, e.g. NFS, home
    directory), `O_EXCL`/`wx` exclusive-create atomicity has historically been weaker than on a
    local filesystem (client-side caching and lock-manager races), so two racing writes for the
    same `proofSha256` could in principle both appear to succeed. In that specific case this
    defense-in-depth layer degrades silently toward the pre-existing local
    `criticalProofConsumption` guard (the ADR-0056 baseline) rather than failing loudly — the
    push stays gated by everything ADR-0056 already checks, just not additionally by this
    layer. This is a known, accepted, narrow limitation of relying on filesystem-level
    exclusivity instead of an explicit lock/journal (§6 already rules the latter out as
    unneeded machinery for a non-secret, non-append, single-file-per-proof marker), not a
    blocking concern for this design.
  - `checkExternalPushLedgerConsumption({ repositoryFingerprint, proofSha256, candidate })`
    — reads that same path; returns `{ ok: true }` only if the file exists, parses as strict
    JSON, has exactly the four schema keys above, and its `repositoryFingerprint` /
    `proofSha256` match the caller's exactly. Otherwise returns `{ ok: false, code }` (see §4
    for the code taxonomy).
- Two call sites (§2): one in `guard-push.mjs`, one in `pipeline-state.mjs`'s `approve-push`
  case.
- One new opt-in key, `gates.push_external_ledger`, in `pipeline.user.yaml` (§5), and a small
  `externalPushLedgerGate(manifestOrDir)` reader (a few lines, modeled on the existing
  `criticalProofWaiverFor` reader shape — same "absent/unreadable/unrecognised" handling
  pattern already established for `gates.push_approval`, except its own absent-value default
  is the opposite direction; see §5 for why).
- No encryption, no external key custody, no lock file, no cross-platform advisory-lock
  code, no recovery/replay journal, no `heads.json`-style projection. This is **not** because
  the entry is secret and secrecy alone would justify skipping integrity machinery — it would
  not: a single-use consumption marker's actually-required property is tamper-resistance, and
  this design does not provide that. Both path components (`repositoryFingerprint`,
  `proofSha256`) are derivable from already-plaintext-visible data — `proofSha256` is already
  committed to `project/pipeline-state.json` in plaintext today, and `repositoryFingerprint` is
  reproducible by anyone who can run `discoverRepository()` against the same checkout (§2) —
  so any process running with the same filesystem privilege as the agent or the operator can
  trivially delete or forge `.pipeline/push-ledger/<repositoryFingerprint>/<proofSha256>.json`:
  deletion undoes the recorded single-use consumption, and writing a plausible-looking
  replacement (same four schema keys) fabricates a consumption record `approve-push` never
  actually wrote. This is an accepted, disclosed limitation, not an oversight: §1's closing
  paragraph and §6 both already state that this design does not defend against a fully
  adversarial agent session with unrestricted filesystem write access, and ordinary
  same-privilege filesystem access is exactly that class of access. PHX-1's
  restricted/encrypted-record machinery exists for genuinely sensitive payloads (secrets) — a
  distinct property from the tamper-resistance this marker lacks and does not claim to have.

## 4. Failure mode

The gate must fail closed once enabled, consistent with this repo's established convention
(ADR-0056 §2: "a gate whose configuration cannot be read sits at its strongest setting,
never its weakest"). This applies on both sides: the read-side taxonomy below
(`checkExternalPushLedgerConsumption`, consulted by `guard-push.mjs`), and the write-side
failure mode that follows it (`appendExternalPushLedgerConsumption`, consulted by
`approve-push`).

**Read side (`checkExternalPushLedgerConsumption`):**

- **Present and valid** (file exists, parses, exact schema keys, `repositoryFingerprint` and
  `proofSha256` both match) → `{ ok: true }`, push proceeds (subject to every other check in
  the file, unchanged).
- **Absent** (no file at the derived path) → `{ ok: false, code:
  "PUSH-EXTERNAL-LEDGER-MISSING" }` → push refused, with the operator pointed at re-running
  `approve-push` (which now also writes this).
- **Present but invalid** — malformed JSON, wrong/extra schema keys, `repositoryFingerprint`
  mismatch, or `proofSha256` mismatch → `{ ok: false, code: "PUSH-EXTERNAL-LEDGER-MISMATCH" }`
  → push refused. This is deliberately the same disposition as "absent": a present-but-wrong
  record must never be treated as better than no record, exactly as `checkLedgerPushAuthority`
  pre-merge treated every one of its seven validation failures identically (all returned a
  blocking string; none of them degraded to a warning).
- **Filesystem unreadable for a reason unrelated to content** (e.g. `rootDir` itself
  unreadable, permission error other than "does not exist") → treated the same as absent:
  `PUSH-EXTERNAL-LEDGER-MISSING`. An unreadable ledger is not evidence of consumption.
- **`gates.push_external_ledger` unrecognised value** (anything other than the literal
  strings `"required"` or `"off"`) → resolves to `"required"` (fails closed), mirroring
  ADR-0056 decision 2's "unrecognised resolves to `signature`" precedent exactly. Only a
  clean, exact `"off"` disables the check.
- **`discoverRepository(projectDir)` throws before the ledger check can even run** — missing or
  symlinked start path, a git spawn that fails to start or exits non-zero (including the
  `WT-GIT-SPAWN` case this repo's own `CLAUDE.md` documents can occur when `git` is
  unexpectedly absent from `PATH`), a submodule/`--separate-git-dir` common-dir shape, or a
  missing primary root — the full throw surface is `worktree-lifecycle.mjs:163-169,231-249`.
  → `failures.push(...)` with the exact message "External push ledger repository topology could
  not be resolved (PUSH-EXTERNAL-LEDGER-TOPOLOGY-UNRESOLVED). Push refused -- this is a
  fail-closed disposition, never a silent pass-through and never an uncaught throw." (§2's
  read-side snippet) → push refused. This is a plain free-text failure message, not a
  `{ ok: false, code }` return value: `checkExternalPushLedgerConsumption` is never called on
  this path (§2's `if (repository !== null)` guard skips it once `discoverRepository` has
  thrown). This is a different failure class from every other read-side case above (it is about
  the repository
  topology needed to even compute the ledger marker's path, not about the marker file itself),
  but the disposition is the same for the same reason: `guard-push.mjs` has no ambient
  try/catch around this integration point, and per `hooks.json`'s own exit-code contract (0
  allow, 2 block, 1 allow+warn), an *uncaught* throw here would exit the process at 1 — which
  this hook's own harness treats as ALLOW, silently discarding every other already-accumulated
  push-gate failure. §2's read-side snippet therefore wraps the `discoverRepository(...)` call
  in its own `try`/`catch`; the `catch` is this bullet's disposition — an explicit, named,
  fail-closed push refusal, never a fall-through to "check not applicable" and never an
  uncaught throw.

**Write side (`appendExternalPushLedgerConsumption`, inside `approve-push`):** two structurally
distinct failure points, in the order they can occur:

1. **`discoverRepository(dir)` itself throws** (§2) — the same `>=7`-path throw surface as the
   read-side bullet above. This happens *before* `appendExternalPushLedgerConsumption` is even
   called -- but per §2's own placement instruction ("immediately after the existing local write
   ... and only if that local write succeeded"), it happens *after* the local
   `writeState(dir, next, base)` write (line 5213) has already succeeded. So this sub-case has
   the SAME state consequence as sub-case `2.`'s filesystem-condition case below:
   `pushApproval.lastApproved` and `criticalProofConsumption` for this `proofSha256` are already
   persisted by the time this catch can fire, and a naive retry with the same proof hits the
   pre-existing `CRITICAL-PROOF-REPLAY` guard (line 5196-5199) -- recovery is not "just retry";
   see the recovery paragraph below, which now covers this sub-case too. Unlike the read-side
   hook, an uncaught throw here would not be silently treated as allow (a crashed CLI process
   exits non-zero on its own, via Node's default uncaught-exception handling), but it would still
   be an unstructured crash instead of the explicit, named `approve-push refused (<CODE>)`
   disposition every other failure in this command produces. §2's write-side snippet wraps this
   call in `try`/`catch` too, with the same `PUSH-EXTERNAL-LEDGER-TOPOLOGY-UNRESOLVED`
   disposition as the read side: `console.error` + `return 2`, before the external-ledger write
   is attempted (the local write has already happened by this point).
2. **The `mkdirSync`+`writeFileSync` pair (§3) fails once both writes are reachable.** Two
   sub-cases, and they must not share a disposition or a recovery story:
   - **A filesystem condition** — permission denied on `.pipeline/push-ledger/` (or an
     ancestor), a read-only or full filesystem, or (per the local-filesystem caveat in §3) a
     lock-manager error on a non-local mount. This is structurally different from every
     read-side case above: by the time it can happen, the local write
     (`writeState(dir, next, base)`, line 5213) has **already succeeded**, so
     `pushApproval.lastApproved` and `criticalProofConsumption` for this `proofSha256` are
     already persisted. A naive retry of `approve-push` with the same `--proof` artifact
     therefore hits the pre-existing `CRITICAL-PROOF-REPLAY` guard (line 5196-5199) and is
     refused — recovery is not "just run the command again"; see the recovery paragraph below.
   - **`EEXIST` on the `writeFileSync(path, json, { flag: "wx", ... })` call itself** →
     `PUSH-EXTERNAL-LEDGER-ALREADY-CONSUMED`. This is not a filesystem condition to fix — it is
     the single-use mechanism's own success case working exactly as designed, surfaced at a
     moment the write side must treat as a hard stop, not a retry. By construction, the local
     write immediately above always runs only *after* the pre-existing `CRITICAL-PROOF-REPLAY`
     guard (`pipeline-state.mjs:5196-5199`) has already refused any `proofSha256` present in
     local `criticalProofConsumption`. So an `EEXIST` here can only mean the external ledger
     already has a consumption record for this exact `proofSha256` that local state does *not*
     have — otherwise the replay guard upstream would have refused the command before this
     write was even attempted. That is exactly the Git-level-replay scenario §1 point 1 exists
     to defend against: a reset, forged, or stale local state file, or a fresh worktree/clone,
     presenting a `proofSha256` as locally unconsumed when the external ledger already knows
     otherwise. Disposition: `approve-push` refuses (`console.error` + `return 2`), identically
     fatal to every other write-side case, but with a **different recovery framing**: there is
     no filesystem condition to fix here, and retrying does nothing but reproduce the same
     `EEXIST` — the "once the underlying condition ... is fixed" language in the
     recovery paragraph below applies to sub-case `1.` and the filesystem-condition sub-case
     immediately above, never to `EEXIST`. Recovery from `EEXIST` is investigative, not mechanical: an
     operator needs to establish why a proof recorded as unconsumed locally is already consumed
     externally (the exact scenario §1 point 1 names) before any push proceeds.

The fail-safe answer this design commits to for sub-case `1.` and both `2.` sub-cases above:
**the write-side failure is fatal to the whole `approve-push` command** — `console.error` +
`return 2`, exactly as §2's write-side snippet already shows, and the existing
`console.log("Push approved by ...")` success line must not be reached. Treating it as a
non-fatal warning would let `approve-push` report success while a `gates.push_external_ledger:
required` project's next push is, correctly, still refused by the read side for
`PUSH-EXTERNAL-LEDGER-MISSING` — a confusing, misleading "succeeded, but didn't" outcome this
design avoids by failing loudly at the point of the actual failure instead. The accepted
operational cost of sub-case `1.` (the `discoverRepository(dir)` throw) and the
filesystem-condition sub-case under `2.` — the two write-side failure points whose recovery is
a fresh signing ceremony (all three write-side failure points, including `EEXIST` above, occur
only after the local write has already succeeded; `EEXIST` alone gets the different,
investigative recovery described above, not this one): because the local write cannot be un-done from
inside `approve-push` itself, and because `.claude/pipeline-state.json` is written EXCLUSIVELY
through the CLI, never hand-edited, with no carve-out for this or any other case (ADR-0029
decision 1, `docs/adr/0029-file-handoffs-status.md:11`), recovering from either has exactly one
path: a fresh human-signed proof for a new signing ceremony, followed by a fresh `approve-push`
call, once the underlying condition (the repository-topology resolution failure, or the
filesystem condition) is fixed. An
earlier draft of this section additionally proposed an operator manually removing the
just-added `criticalProofConsumption` entry from local state as a second recovery option — that
option is withdrawn here: it is a hand-edit of a CLI-exclusive file, which ADR-0029 decision 1
forbids outright, with no carve-out for "explicit and auditable." This design also does not
propose a new CLI subcommand to programmatically undo that one local write instead: §6 already
states that this design builds no revocation flow for the external ledger entry and goes no
further than the *existing* local `criticalProofConsumption` mechanism already goes (which also
has no revocation flow today); a dedicated "undo this one local write" subcommand would be new,
security-sensitive surface built solely for a narrow, expected-to-be-rare edge case, which is
disproportionate and inconsistent with that already-stated scope discipline. A fresh signing
ceremony is accepted as the operational cost instead. This is a genuine, disclosed rough edge of
the local write and the external-ledger write not being one atomic transaction; per §3, the one
concretely identified cause (`ENOENT` on first use in a repository) is eliminated by the
`mkdirSync` step, so in practice the filesystem-condition sub-case is expected to be rare, not
routine. `EEXIST` (above) has no comparable "fixed by mkdirSync" mitigation and is not expected
to be rare in the same sense — it is a signal, not an accident.

## 5. Migration/rollout note

This is additive to an **already working** gate (ADR-0056), and on day one of shipping this
design, zero existing repositories have ever run the write side (§2, `approve-push`), so
zero existing repositories have a populated external ledger. If the read side defaulted to
"required" the moment this code ships, every push in every project that installs the updated
plugin would break immediately, with no operator action having caused it — this is exactly
the outcome DoD item 5 rules out, and it is a different situation from ADR-0056's own
fail-closed default (there, an *already-populated* mechanism's config became unreadable;
here, *no* repository has ever populated the new mechanism at all).

Rollout is therefore explicit opt-in, not default-on:

- New key `gates.push_external_ledger` in `pipeline.user.yaml`, absent by default.
- **Absent or missing file → the check is not consulted at all** (equivalent to `"off"`).
  This is the one place this design's default direction differs from ADR-0056's "absent
  resolves to strongest," and it differs for the concrete reason above, not out of
  inconsistency — it is stated here explicitly so it is not mistaken for a silent copy of
  ADR-0056's rule.
- Once set to `"required"`, every other value (including malformed/absent-but-explicitly-
  referenced) resolves to `"required"` per §4 — the fail-closed direction re-applies from
  that point on, matching ADR-0056's philosophy for a gate that IS turned on.
- Suggested adoption path (not binding on this design, a note for the implementation
  dispatch): enable on `sprint_phoenix`/this repo first behind the flag, verify a full
  approve-push → push cycle writes and is read back correctly, then let other calibrated
  projects opt in individually. A future ADR can flip the *default* to `"required"` once
  adoption is proven, exactly as `gates.push_approval` itself was introduced as an optional
  key with a safe default (ADR-0056 §2) before anything depended on it universally.

## 6. Explicitly out of scope

- **Reviving PHX-1's portable governance-event ledger** (hash chain, checkpoints, advisory
  file locks, write-ahead recovery journal, `heads.json` projection) — not built. The
  create-exclusive single-file-per-proof mechanism in §3 gets single-use semantics from the
  filesystem's own `EEXIST` behavior; it needs none of PHX-1's machinery because it never
  appends to or replays a stream.
- **Reviving the Recovery Bridge / feature-package / continuity-authority-revision
  machinery** — main's own `poGateAuthority` / `activeFeature` / continuity system already
  serves plan approval and continuity; this design does not read, write, or duplicate any of
  it. The external ledger entry is deliberately feature-agnostic.
- **`hasLedgerBackedPlanApproval` for `guard-devplan.mjs`** (backlog item finding 3) — a
  structurally similar but separately scoped gap for *plan* approval rather than *push*
  approval. Not addressed here; the Goal for this dispatch is push authority only. A parallel
  design for the plan-approval gate, if wanted, should be its own dispatch so it is not
  smuggled in under this one's DoD.
- **`guard-git.mjs` override-consumption ledger scoping** (backlog item finding 4) — same
  reasoning: a different guard, a different gap, out of scope here.
- **The restricted/encrypted governance-record profile** (AES-256-GCM, external key custody,
  owner-only root with no Git counterpart) — not needed; see §3's last paragraph. Nothing
  stored by this design is secret.
- **General revocation, expiry, or multi-operator reconciliation for the external ledger
  entry** — not built. The entry is create-once, consult-once, matching the *existing*
  `criticalProofConsumption` semantics exactly (which also has no revocation flow today); this
  design does not go further than its local counterpart already goes.
- **A user-facing CLI/inspection tool for the external ledger** — not built. Only the two
  internal functions in §3 are proposed; an operator who needs to inspect it reads the JSON
  file directly (it is small, unencrypted, and self-describing).
- **Defending against a fully adversarial agent session with unrestricted filesystem write
  access outside the repository** — explicitly not claimed (§1). This design raises the bar
  against Git-level state manipulation and against a single bug in the existing local
  enforcement chain; it is not a sandboxing or privilege-separation mechanism, and it does not
  pretend to be one.
- **Proving genuine human presence for `chat` mode** — explicitly not claimed (§1). No purely
  local mechanism can provide this; an out-of-band channel would be a materially different
  (and materially larger) design than "smallest additive mechanism" calls for.
- **Any coverage of `chat`-mode-approved pushes at all** — not built, and this is a distinct,
  stronger exclusion than the point above: this design's check is not merely weaker for `chat`
  mode, it is never consulted for it (§1's coverage boundary, §2). Giving it *any* coverage
  would require a `chat`-mode-specific consumption key (nothing today plays the role
  `proofSha256` plays for `signature` mode) and inventing single-use semantics `chat` mode does
  not have locally today either — out of scope for "smallest additive mechanism"; left to a
  follow-up design.
