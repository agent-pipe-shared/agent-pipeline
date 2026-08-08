# Codex-under-WSL freshness: the closed host-action family (sub-design of Part B §B.3)

Owner: Pipeline maintainers. Status: DESIGN ONLY — this document specifies `.mjs` surface, it
creates none. No `.mjs`, `.json`, `.yaml` or guardrail/config file was changed to produce it;
the single file this dispatch writes is this document.

Parent: `specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md`
(cited below as §B.x / §A.x). That document's §B.8 leaves exactly one item unresolved —
*"Finalizing the exact closed action-family schema/names for the new host-action family (§B.3).
This is real remaining design surface, flagged rather than resolved here given its security
sensitivity ... recommended as a fast-follow granular sub-design with its own Critic pass before
implementation"* — and this document is that sub-design. It refines §B.3 only. It does not
restate the parent; every claim the parent already carries is cited by section rather than
copied, and Part A is touched only where this document must avoid contradicting it (§2.1).

**Model-policy disclosure, continuing the parent document's running convention (its header
records four dispatches and one standing commitment):** the dispatch that authored this
sub-design (`PHX-BFAM`) ran on the Design-tier model `claude-opus-5`, effort `xhigh`, recorded in
its dispatch metadata, with the stated justification that the document widens an attested host
boundary from one fixed action to a family of eight. On-tier, per MP-05/MP-22/MP-23.

---

## 1. Scope

**In scope.** The closed action family that the substitute `spawn` implementation (§B.2(b)) uses
when `runner === "codex" && wsl` (§B.4): its schema ids and version rule, the name and JSON shape
of every member, the exact argv each member expands to, the validation rule for every
caller-supplied value that reaches an argv, the dispatch rule, the rejection path, the structural
guarantee separating the two classes, execution profiles and output sanitisation, the receipt and
request-hash shape, the threat-model amendments the widening requires, and a test plan.

**Out of scope, deliberately.**

- Rewiring `plugins/pipeline-core/scripts/ruleset-freshness-host.mjs` so that it imports cleanly
  again. That file does not load today: nine of its named imports do not exist on this branch
  (verified by the parent's own verification log, and consistent with reading the file — it
  imports `createFreshnessHostAction`, four `FRESHNESS_HOST_*_SCHEMA` constants,
  `inspectCliRulesetFreshness`, `PUBLIC_MARKETPLACE_URL` and `WSL_FRESHNESS_BOUNDARY_ID` from
  `./ruleset-freshness.mjs` at lines 20-29, `freshnessHostActionForPreflight` from
  `./pipeline-start-preflight.mjs` at line 30, and `observeCodexRulesetSource` from
  `../lib/codex-host-plugin-list.mjs` at line 31, none of which the current modules export).
  Repairing that chain, and re-establishing the preflight binding
  (`validPreflightBinding`/`freshnessHostActionForPreflight`, `ruleset-freshness-host.mjs:116-123`),
  is the implementation dispatch's work. §7.4 states the one requirement this design imposes on it.
- The §B.2(a) `executionBoundary` scoping fix, §B.6's doc updates, and Part A in its entirety.
- Any change to `inspectPipelineUpdateAvailability`'s orchestration model (§B.8 forbids it). Every
  decision below is constrained by "the caller is not modified"; where that constraint costs
  something, it is named rather than traded away.

---

## 2. What the caller actually does — the eight invocations, verified

Read directly from `plugins/pipeline-core/scripts/ruleset-freshness.mjs` on this branch. The
seam is `run()` at lines 38-46: `(options.spawn ?? spawnSync)(command, args, {cwd, encoding,
timeout, shell: false, env})`. `git()` at lines 48-50 is a thin wrapper that prepends `-C <repo>`
and forces `cwd: undefined`. Every call site propagates `options`, so `options.spawn` reaches all
eight — verified hop by hop: `loadedIdentity(options)` at `:283` → `:84`;
`selectedChannelTarget(..., options)` at `:301` → `:185`; `pluginObjectPath(..., options)` at
`:326` → `:236`; `readMarketplaceVersion(temporary, env, options)` at `:363` → `:244`;
`compareLoadedToMarketplace(..., options)` at `:366` → `:255` and `:263`; `:315` and `:333` call
`run()` directly.

| # | Line | Class | argv as passed to `spawn` (command is always the literal `"git"`) |
| --- | --- | --- | --- |
| 1 | `:84` | local | `["-C", <pluginRoot>, "rev-parse", "--verify", "HEAD"]` |
| 2 | `:185` | network | `["ls-remote", <remoteUrl>, <selector>]` |
| 3 | `:236` | local | `["-C", <pluginRoot>, "rev-parse", "--git-path", "objects"]` |
| 4 | `:244` | local | `["--git-dir", <temporary>, "show", "refs/pipeline/marketplace:<manifestPath>"]` |
| 5 | `:255` | local | `["--git-dir", <temporary>, "update-ref", "refs/pipeline/loaded", <loadedCommit>]` |
| 6 | `:263` | local | `["--git-dir", <temporary>, "rev-list", "--left-right", "--count", "refs/pipeline/loaded...refs/pipeline/marketplace"]` |
| 7 | `:315` | local | `["init", "--bare", "--quiet", <temporary>]` |
| 8 | `:333` | network | `["--git-dir", <temporary>, "-c", "maintenance.auto=false", "fetch", "--quiet", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", <remoteUrl>, "<selectedCommit>:refs/pipeline/marketplace"]` |

Two further properties of the caller, both verified by reading the control flow and both load-
bearing below:

- **Every invocation happens at most once per `inspectPipelineUpdateAvailability` call.** `:84` is
  inside `loadedIdentity`, called once at `:283` and guarded by `if (!commit)`; `:185` is reached
  once via `:301`; `:236` once via `:326`; `:244` at most once (`:363`, only when
  `options.marketplaceVersion` and `selected.version` are both absent — i.e. the alpha channel);
  `:255` at most once and only when `loaded.commit` is set (`:254`); `:263` only when `:255`
  succeeded (`:262`); `:315` and `:333` exactly once each.
- **No invocation's behaviour depends on the working directory.** `-C` and `--git-dir` are
  explicit and absolute (`pluginRoot` is `resolve(...)` at `:69`; `temporary` is `mkdtempSync` at
  `:313`), `init` names its target absolutely, and `ls-remote`/`fetch` name the remote explicitly.

The result shape the caller consumes is a subset of `spawnSync`'s: `status` (`:86`, `:190`,
`:238`, `:250`, `:262`, `:316`, `:350`), `stdout` (`:85`, `:194`, `:225`, `:237`, `:250`),
`error?.code` and `signal` (`:191`, `:357`). Nothing reads `pid` or `stderr`.

### 2.1 Where the parent design is stale or incomplete about the current code

Stated as a dedicated section per this dispatch's DoD, rather than silently writing the corrected
version.

1. **`plugins/pipeline-core/lib/public-core-origin-allowlist.mjs` already exists.** §A.3 item 1
   and §A.7 speak of it as work to be done ("declared in its own small, new, dedicated module"),
   and §A.3 item 3 speaks of "the next free id after GS-7" as a future addition. Both have
   landed: the module is present, exports `PUBLIC_MARKETPLACE_URL` (line 16) and
   `PUBLIC_SELF_APPLICATION_ORIGINS` (line 18), and its own header cites its protecting
   `GATE_STRENGTH_PATHS` entry as **GS-8**. This is staleness, not error — the parent was written
   before Part A shipped — but it changes one decision here: §4.1's `marketplaceUrl` slot **reuses
   that existing constant** instead of re-declaring the literal (§4.1, note on GS-8).
2. **The provisional list in §B.3 carries nine names for eight invocations.** Reconciled against
   the real call sites: the ninth name is not a ninth call site. `:185` is a single invocation
   whose third argument is `channel === "alpha" ? "refs/heads/main" : "refs/tags/*"` (`:184`), and
   §B.3 named both selectors (`ls-remote-refs-heads-main`, `ls-remote-refs-tags`) while counting
   them as one member — its own class summary says "Network-delegated class (2 members)" and
   lists those two names as a single slash-joined item. This design keeps the parent's count: one
   member with a two-value enumerated selector slot (§4.2, member N1), giving 8 members = 8 call
   sites. **The class split is unchanged** (2 network at `:185`/`:333`, 6 local), so no stop
   condition applies.
3. **§B.3's eight line citations are accurate.** `:84`, `:185`, `:236`, `:244`, `:255`, `:263`,
   `:315`, `:333` all resolve to the invocations the parent describes, and its local/network
   classification of each one is correct. Re-verified here rather than trusted.
4. **§B.3 describes the local class as executing "via the ordinary, unrestricted local
   `spawnSync`".** This design narrows that (§8): the local class runs with an adapter-pinned
   `cwd`, timeout and environment rather than with the caller's third argument. The narrowing is
   strictly more restrictive than the parent's wording and changes no outcome; it is disclosed as
   a deviation in §13.
5. **§B.6's doc-update list is incomplete for the threat model.** It flags
   `docs/phoenix-governance-threat-model.md:15` (the asset row) and the rollback paragraph at
   `:61-70`, framing the latter as an export-name problem. The *operating rule* in that same
   paragraph — "The productive WSL adapter has no durable state, lockfile, repository mutation, or
   fallback executor. It performs one public observation from the fixed host directory and returns
   only a validated public object ID plus the privacy-safe host-control identity digest" — is
   falsified by the family in three independent ways, only one of which is about names (§10.3).
   That is a genuine gap in the parent's list, and it carries the one open question this design
   hands to the PO (§13).

---

## 3. Schema ids and version rule

The repository's convention is `pipeline.<kebab-name>.v<major>`, verified against three real
occurrences rather than inferred: `pipeline.pipeline-update-availability.v1`
(`ruleset-freshness.mjs:29`), `pipeline.ruleset-freshness-network-preflight.v1`
(`ruleset-freshness-host.mjs:205`), `pipeline.ruleset-source.v1` (§A.3). The family declares four
ids and one boundary id:

| Constant | Value | Carried by |
| --- | --- | --- |
| `PIPELINE_UPDATE_HOST_ACTION_SCHEMA` | `pipeline.pipeline-update-host-action.v1` | every member descriptor and every request |
| `PIPELINE_UPDATE_HOST_RESULT_SCHEMA` | `pipeline.pipeline-update-host-result.v1` | the envelope the executors return internally |
| `PIPELINE_UPDATE_HOST_RECEIPT_SCHEMA` | `pipeline.pipeline-update-host-receipt.v1` | one per network-class execution |
| `PIPELINE_UPDATE_HOST_REFUSAL_SCHEMA` | `pipeline.pipeline-update-host-refusal.v1` | one per refused request (§6) |
| `PIPELINE_UPDATE_HOST_BOUNDARY_ID` | `pipeline-update-availability-wsl-host.v1` | request hash, receipt, preflight binding |

**A new boundary id, not the retired `WSL_FRESHNESS_BOUNDARY_ID`, and that is deliberate.** The
threat model's abuse row for a "Copied, substituted, or stale host request"
(`docs/phoenix-governance-threat-model.md:32`) requires that "Boundary ID and request hash must
match exactly". The action surface bound to the old id was one fixed action
(`ruleset-freshness-host.mjs:110,138`); the surface bound to the new id is a family of eight. Two
different contracts must not share one boundary id, so a pre-family preflight binding or receipt
fails closed against the new adapter instead of half-matching. The old id's literal is not
reachable on this branch anyway (it was an export of the pre-merge `ruleset-freshness.mjs`; §1).

**Version rule (the family is closed, so membership is part of the contract).** A `v2` is required
for any of: adding or removing a member; changing a member's argv template, arity, class, or the
domain of any slot; changing the dispatch rule or the at-most-once budget; changing an output
sanitiser in a way that admits bytes it previously dropped. A `v1`-compatible change is limited to
tightening a slot domain, tightening an output sanitiser, or adding a field to the receipt that
carries no new caller-supplied value. Consequence, stated plainly: "we also need `git gc` on the
temp repo" is a `v2`, reviewed like the widening this document is.

## 4. The family

### 4.1 Slot vocabulary

Every argv position is either a **literal** (matched with `===` against a frozen string) or a
**slot**. There are exactly seven slots in the family; there is no wildcard slot and no
variadic tail anywhere.

| Slot | Domain and validation rule | Where it comes from in the caller |
| --- | --- | --- |
| `marketplaceUrl` | Enumerated, one value: `===` `PUBLIC_MARKETPLACE_URL` imported from `plugins/pipeline-core/lib/public-core-origin-allowlist.mjs:16`. | `options.remoteUrl` or `resolveMarketplaceUrl` from `.claude/settings.json` (`ruleset-freshness.mjs:289`, `staleness-check.mjs:32-52`) |
| `channelSelector` | Enumerated, two values: `refs/heads/main`, `refs/tags/*`. | `ruleset-freshness.mjs:184`, derived from the resolved channel |
| `loadedPluginRoot` | Enumerated, one value: `===` the adapter's own `loadedPluginRoot`, resolved at adapter construction from `import.meta.url`, never from an argument. | `resolve(options.pluginRoot ?? PLUGIN_ROOT)` (`:69`) |
| `temporaryGitDir` | First use (member L5 only): `isAbsolute`, no `..` segment, `resolve(dirname(v)) === resolve(os.tmpdir())`, basename matches `^pipeline-update-availability-[A-Za-z0-9]{6}$`. Every later use: `===` the value the adapter recorded at L5. | `mkdtempSync(join(tmpdir(), "pipeline-update-availability-"))` (`:313`) |
| `loadedCommitOid` | `^[0-9a-f]{40}$` (lowercase only). | `loaded.commit`, itself already `OID`-filtered at `:91`; reachable from the CLI flag `--loaded-commit` (`:421`) |
| `selectedCommitRefspec` | `^[0-9a-f]{40}:refs/pipeline/marketplace$`, **and** the 40-hex prefix must be a member of the OID set the adapter recorded from its own sanitised `ls-remote` output (§8.3). | `` `${selected.commit}:refs/pipeline/marketplace` `` (`:344`) |
| `marketplaceManifestRef` | Enumerated, one value: `refs/pipeline/marketplace:plugins/pipeline-core/.codex-plugin/plugin.json`. | `` `refs/pipeline/marketplace:${path}` `` where `path` is `options.marketplaceManifestPath ?? MANIFEST_RELATIVE_PATH` (`:243`, `:36`) |

Notes that matter, each with its cost:

- **No slot in the family accepts a value taken from the incoming call as its own authority.**
  Four slots are pinned constants, one is a two-value enumeration, one is a 40-hex regex on a value
  that can only reach an inert local ref write, and one is a regex *plus* membership in a set the
  adapter itself produced. That is the property that makes "no argv drift" checkable rather than
  asserted.
- **`marketplaceUrl` is a one-value domain, so a consumer configuring a different marketplace in
  `.claude/settings.json` gets `unknown` freshness on Codex+WSL rather than a host-attested read.**
  This is required, not incidental: threat-model rows at `:14` and `:34` state that only the
  reviewed Public-Core coordinate is a freshness authority and that private marketplace
  coordinates never are. It is also not a regression — today *every* Codex+WSL session gets
  `unknown` (§B.1) — so the family simply does not extend the improvement past the reviewed
  coordinate.
- **Sourcing `PUBLIC_MARKETPLACE_URL` from the existing GS-8-protected module (§2.1 item 1) rather
  than re-declaring the literal** means the network boundary's only reachable URL is a constant an
  agent session cannot edit at all once GS-8 is enforcing. Re-declaring it in the family module
  would have created a second, unprotected copy of a gate-deciding constant — the exact failure
  §A.3 item 3 exists to prevent.
- **`marketplaceManifestRef` is pinned to the literal, which refuses `options.marketplaceManifestPath`.**
  That option is a test seam; `parseArgs` (`:417-426`) cannot set it and no production caller does.
  Pinning it removes the only slot in the family through which a path fragment could be
  concatenated into a `git show` object spec. Cost: a future caller wanting a different manifest
  path must change the family (a `v2`), not just pass an option.

### 4.2 The eight members

Two frozen tables. Membership in a table *is* the class (§7); no descriptor spells its own class
in a literal.

**Network-delegated table (`NETWORK_ACTIONS`), 2 members.**

| Id | argv template (command is the literal `"git"`) |
| --- | --- |
| `N1` `ls-remote-channel-target` | `"ls-remote"`, `marketplaceUrl`, `channelSelector` |
| `N2` `fetch-marketplace-commit` | `"--git-dir"`, `temporaryGitDir`, `"-c"`, `"maintenance.auto=false"`, `"fetch"`, `"--quiet"`, `"--no-tags"`, `"--no-recurse-submodules"`, `"--no-write-fetch-head"`, `marketplaceUrl`, `selectedCommitRefspec` |

**Local-passthrough table (`LOCAL_ACTIONS`), 6 members.**

| Id | argv template (command is the literal `"git"`) |
| --- | --- |
| `L1` `rev-parse-loaded-head` | `"-C"`, `loadedPluginRoot`, `"rev-parse"`, `"--verify"`, `"HEAD"` |
| `L2` `rev-parse-loaded-objects-path` | `"-C"`, `loadedPluginRoot`, `"rev-parse"`, `"--git-path"`, `"objects"` |
| `L3` `show-marketplace-manifest` | `"--git-dir"`, `temporaryGitDir`, `"show"`, `marketplaceManifestRef` |
| `L4` `update-ref-loaded-commit` | `"--git-dir"`, `temporaryGitDir`, `"update-ref"`, `"refs/pipeline/loaded"`, `loadedCommitOid` |
| `L5` `init-comparison-repo` | `"init"`, `"--bare"`, `"--quiet"`, `temporaryGitDir` |
| `L6` `rev-list-loaded-marketplace-count` | `"--git-dir"`, `temporaryGitDir`, `"rev-list"`, `"--left-right"`, `"--count"`, `"refs/pipeline/loaded...refs/pipeline/marketplace"` |

The full descriptor JSON, one from each table (the remaining six differ only in the fields shown):

```json
{
  "schema": "pipeline.pipeline-update-host-action.v1",
  "boundaryId": "pipeline-update-availability-wsl-host.v1",
  "id": "N1",
  "action": "ls-remote-channel-target",
  "argv": ["ls-remote", {"slot": "marketplaceUrl"}, {"slot": "channelSelector"}],
  "cwd": "/",
  "timeoutMs": 30000,
  "envProfile": "sterile-wsl-system-git",
  "output": "ls-remote-refs",
  "maxCalls": 1
}
```

```json
{
  "schema": "pipeline.pipeline-update-host-action.v1",
  "boundaryId": "pipeline-update-availability-wsl-host.v1",
  "id": "L5",
  "action": "init-comparison-repo",
  "argv": ["init", "--bare", "--quiet", {"slot": "temporaryGitDir"}],
  "cwd": null,
  "timeoutMs": 5000,
  "envProfile": "local-comparison",
  "output": "empty",
  "maxCalls": 1
}
```

Field types: `schema`/`boundaryId`/`id`/`action`/`output`/`envProfile` are non-empty strings from
closed sets; `argv` is a frozen array whose entries are either a string literal or a frozen
`{slot}` object naming one of §4.1's seven slots; `cwd` is `"/"` for the network table and `null`
(meaning "do not set one") for the local table; `timeoutMs` is a positive integer; `maxCalls` is
the integer `1` for all eight (§5 rule 6). Every descriptor is `Object.freeze`d, as is each table.

### 4.3 Reconciling the parent's provisional names

| §B.3 provisional name | Resolved as |
| --- | --- |
| `ls-remote-refs-heads-main` | `N1` with `channelSelector = "refs/heads/main"` |
| `ls-remote-refs-tags` | `N1` with `channelSelector = "refs/tags/*"` |
| `fetch-commit(sha)` | `N2` |
| `rev-parse-verify-head` | `L1` |
| `rev-parse-git-path-objects` | `L2` |
| `show-marketplace-manifest` | `L3` (name kept) |
| `update-ref-loaded` | `L4` |
| `init-bare` | `L5` |
| `rev-list-left-right-count` | `L6` |

Nine provisional names, eight members, eight call sites — because the first two are one call site
with a two-value enumerated slot (§2.1 item 2). The alternative (two separate members `N1a`/`N1b`
with no slot) was considered and rejected: it would have made the family nine members with an
argv-identical prefix, doubling the surface the drift test in §12 must cover while adding no
closure — a two-value enumerated domain is exactly as closed as two names, and keeping one member
per call site keeps the family's cardinality checkable against the caller (§12, `T-DRIFT`).

## 5. The dispatch rule

The substitute passed as `options.spawn` has the `spawnSync` signature `(command, args, options)`.
It decides membership as follows, and refuses (§6) the moment any step fails.

1. **`command` must be `===` the literal string `"git"`.** Not a path, not `git.exe`, not a
   `PATH`-resolved variant. The caller only ever passes `"git"` (`:84`, `:185`, `:236`, `:244`,
   `:255`, `:263`, `:315`, `:333`, all via `run()`), and the executable that actually runs is
   chosen by the boundary, never by the request (§8).
2. **`args` must be an array of strings** and `args.length` must `===` the candidate descriptor's
   template length. **Matching is full-argv and positional, never a prefix and never a
   normalised form.** No trimming, no case folding, no path normalisation, no option reordering,
   no `--` splitting: the incoming strings are compared as they arrive.
3. **Each position is checked in order**: a literal with `===`, a slot with its total boolean
   validator from §4.1. A validator never mutates and never falls back to a default.
4. **Exactly one member may match.** The matcher evaluates all eight and refuses on zero matches
   *and* on two or more. The tables are disjoint by construction (positions 0/1 discriminate), so
   a multi-match is a family defect; making it a refusal turns that defect into a fail-closed
   result rather than a silent first-wins.
5. **Stateful preconditions.** `temporaryGitDir` is bound at `L5` and required to be identical
   afterwards, so `N2`/`L3`/`L4`/`L6` cannot match before `L5` has run. `selectedCommitRefspec`'s
   OID must be in the set recorded from `N1`'s own sanitised output, so `N2` cannot match before
   `N1` has succeeded. No total order is imposed beyond these two bindings — a total order would
   pin the caller's current statement sequence, which §B.8 forbids this design from constraining,
   and it would add nothing the bindings do not already give.
6. **At most once per member per adapter instance.** Verified admissible against the caller in §2;
   a second match of the same member is a refusal. One adapter instance serves exactly one
   `inspectPipelineUpdateAvailability` call, so the recorded bindings and counters die with the
   temp directory the caller removes at `:377`.
7. **The third argument is not consulted at all** — not for matching, not for execution. Nothing a
   caller puts in `cwd`, `env`, `timeout`, `shell` or `encoding` can influence which member matches
   or how it runs (§8 states what runs instead, and why that is behaviour-preserving).

**Why a caller cannot widen this.** The arity check forecloses appending arguments; the absence of
any wildcard slot forecloses smuggling one inside a matched position; the templates are
module-private frozen constants that the matcher reads from module scope and never from an
argument, `options`, an environment variable or a config file; the pinned slots resolve against
values the adapter computed for itself; and the two stateful slots resolve against values the
adapter recorded from its own earlier, already-validated output. Widening the family therefore
requires editing the module — which is a `v2` (§3) with a Critic pass — not calling it differently.

## 6. The rejection path

A request matching none of the eight members — or matching one but failing a stateful
precondition or its call budget — **never reaches a process**. There is no `default` branch, no
`else` that forwards to `spawnSync`, and no "unknown but harmless-looking, so pass it through"
case. This is the mechanical form of the threat model's "No direct fallback after restricted
preflight" mitigation (`docs/phoenix-governance-threat-model.md:31`) and of §B.3's own resolution.

**The typed refusal is observable in two places, because it has two audiences.**

**(a) The return value the caller sees.** It must be shaped like a `spawnSync` failure, since the
caller is not modified and reads that shape (§2). The frozen refusal return is:

```json
{ "status": null, "signal": null, "stdout": "", "stderr": "", "pid": null,
  "error": { "name": "Error", "code": "PUHA-REFUSED", "message": "pipeline-update host action refused" } }
```

`code` is deliberately **not** `ETIMEDOUT`: the caller distinguishes only that one code (`:191`,
`:357`), so a refusal must not be reported as a timeout. `message` is a fixed string — it never
contains argv, a path, a URL or an environment value (§9).

**(b) A durable refusal record on the adapter**, appended to a frozen array and surfaced by the
host CLI in its output envelope, so a refusal is auditable rather than merely degraded:

```json
{ "schema": "pipeline.pipeline-update-host-refusal.v1",
  "boundaryId": "pipeline-update-availability-wsl-host.v1",
  "sequence": 3, "code": "unmatched-argv", "action": null, "requestSha256": "<64 hex>" }
```

`code` comes from a closed set: `unmatched-command`, `unmatched-argv`, `slot-rejected`,
`multiple-matches`, `precondition-unbound`, `call-budget-exceeded`, `transport-unavailable`.
`action` is the member id when one matched and a later rule refused, otherwise `null`. The record
carries **no argv and no paths** — only the request digest (§9), which is enough to correlate two
refusals without publishing what was in them.

**What the caller does with each refusal**, read off its own control flow, so the fail-open
promise in §B.5 is checked rather than asserted:

| Refused member | Immediate effect | Final observable |
| --- | --- | --- |
| `N1` | `remote.status !== 0` at `:190`, `error.code` is not `ETIMEDOUT` | `unknown`, reason `remote-unavailable` |
| `N2` | `fetch.status !== 0` at `:350` | `unknown`, reason `remote-object-unavailable` |
| `L1` | `commit` stays unset (`:86`), `commitSource` `null` | version comparison, or `unknown`/`loaded-comparison-unavailable` |
| `L2` | `alternate` is `null` (`:238`), no `GIT_ALTERNATE_OBJECT_DIRECTORIES` | unchanged status; `L4` may then fail and fall back to version comparison |
| `L3` | `marketplace.version` stays `null` (`:250`) | unchanged when `L4`/`L6` succeed; otherwise `unknown`/`loaded-comparison-unavailable` |
| `L4` | `localRef.status !== 0` at `:262` | version comparison with reason `loaded-commit-unavailable` |
| `L5` | `init.status !== 0` at `:316` | `unknown`, reason `comparison-init-failed` |
| `L6` | `relation()` returns `null` (`:226`) | `unknown`, reason `loaded-marketplace-diverged` |

Every row degrades to an existing typed status; none produces a new failure mode, none blocks
bootstrap, and none can be mistaken for a freshness claim — exactly the property
`harness/session-bootstrap.md:162` states and §B.5 relies on. Escalating a refusal beyond this
would contradict the parent design's fail-open convention, so the design surfaces refusals and
does not escalate them.

## 7. The class boundary as a structural property

The requirement is that a local-passthrough shape can never be routed through the network channel,
and a network shape can never fall back to local `spawnSync`. Four mechanisms, none of which is a
comment or a convention:

**7.1 Two disjoint frozen tables, and descriptor identity — not a class string — decides the
route.** `NETWORK_ACTIONS` and `LOCAL_ACTIONS` are separate frozen arrays; there is no combined
array. The matcher resolves against one table at a time and hands the resolved descriptor to the
executor bound to *that* table. Each executor re-checks membership by object identity —
`if (!NETWORK_ACTIONS.includes(descriptor)) refuse` and the symmetric check in the local executor.
A forged or hand-built descriptor with `action: "ls-remote-channel-target"` fails that check
because `===` identity with a module-private frozen object cannot be reconstructed from outside
the module. A mutable `class` field could be spoofed; array identity cannot.

**7.2 The network executor has no local spawner in lexical scope.** It lives in its own module —
proposed `plugins/pipeline-core/lib/pipeline-update-host-network.mjs` — which **does not import
`node:child_process` at all**. It receives the App-Server-attested `hostTransport.execute` as a
parameter and has nothing else to call. "A network shape cannot fall back to local `spawnSync`" is
therefore not a rule the implementation must remember; it is a statement about what is reachable
from that file. It is also directly testable at source level (§12, `NEG-6`). If `hostTransport` is
absent or fails `hostControlBinding` validation, the executor returns a `transport-unavailable`
refusal (§6) — the one thing it cannot do is run the command anyway.

**7.3 The local executor never receives a transport.** `executeLocalAction(descriptor, request)`
has no transport parameter in its signature, so a local shape cannot be routed through the network
channel even by a caller who wants to. The only module importing both executors is the composition
root in `plugins/pipeline-core/scripts/ruleset-freshness-host.mjs`, which does nothing but wire
them to their own tables.

**7.4 One requirement on the composition root.** The substitute is produced by a factory —
`createPipelineUpdateHostSpawn({hostTransport, loadedPluginRoot})` — that closes over its pinned
constants at construction and exports nothing else. `inspectPipelineUpdateAvailability` receives
only the resulting function as `options.spawn`; it never sees a table, a descriptor or an executor.
The factory must refuse to construct at all when `hostTransport` is absent, so that a Codex+WSL
session with a broken host boundary keeps today's plain-`spawnSync` path (`unknown`, fail-open)
instead of getting an adapter that refuses all eight members. That is the only requirement this
sub-design places on the host-CLI rewiring that §1 scopes out.

## 8. Execution profiles and output sanitisation

### 8.1 What actually runs

| | Network table | Local table |
| --- | --- | --- |
| Executable | the boundary's literal `/usr/bin/git`, as today (`ruleset-freshness-host.mjs:48`) | `"git"` via `spawnSync`, as the caller does today |
| Route | `hostTransport.execute(request)` — the App-Server-attested channel | direct `spawnSync` |
| `cwd` | `/` | not set |
| Env | `WSL_SYSTEM_GIT_ENV` verbatim (`ruleset-freshness-host.mjs:49-61`), no inheritance | `process.env` plus `GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_NOSYSTEM=1`, plus the recorded alternates for `L3`/`L4`/`L6` |
| Timeout | 30000 ms (`DEFAULT_TIMEOUT_MS`, `ruleset-freshness.mjs:34`) | 5000 ms (`run()`'s default, `:42`) |
| `shell` | `false` | `false` |

The caller's third argument is discarded (§5 rule 7) and each profile is rebuilt by the adapter.
Three consequences, all disclosed rather than smoothed over:

1. **The local profile is behaviourally equivalent to today's**, with two deliberate micro-
   differences. `GIT_TERMINAL_PROMPT`/`GIT_CONFIG_NOSYSTEM` are set for `L1`/`L2`/`L5` as well,
   where the caller does not set them today (`:44` passes `process.env` through) — they cannot
   change the outcome of `rev-parse` or `init --bare`, and they extend the threat model's
   `:33` hardening to the whole family. And `GIT_ALTERNATE_OBJECT_DIRECTORIES` for `L3`/`L4`/`L6`
   comes from the adapter's own record of `L2`'s validated output, not from the caller's `env`
   (`:326-332`) — the same value by construction, sourced where it cannot be substituted.
2. **The network profile drops the alternates for `N2`.** The sterile environment inherits
   nothing, so the fetch cannot reuse the loaded plugin's object store and transfers more objects.
   This is a bandwidth cost on a once-per-session read, never a correctness change: the fetch's
   result is the same commit either way, and `L4`/`L6` still see the loaded commit through the
   alternates the local profile supplies.
3. **Fixing `cwd` closes an ambient-context surface at no cost**, because §2 establishes that no
   member's behaviour depends on it.

### 8.2 `N2` writes, and that is the honest description

`N2` is a `fetch`. It is read-only toward the remote and toward the project and the loaded plugin,
and it **writes** — objects plus one ref — into the disposable bare repository the caller created
at `:313` and removes at `:377`. Every member therefore declares `access` explicitly:
`remote-read-only` for `N1`; `remote-read-only, local-write: comparison-repo` for `N2`;
`local-read-only` for `L1`/`L2`/`L3`/`L6`; `local-write: comparison-repo` for `L4`/`L5`. The write
is bounded three ways: the target directory is the one bound at `L5` under the process tmpdir, the
refspec's destination is the fixed literal `refs/pipeline/marketplace`, and the source is an OID
the adapter itself observed. This falsifies one sentence of the threat model's operating rules and
requires an amendment — §10.3, and the open question in §13.

### 8.3 Output sanitisation: canonical re-serialisation, never raw bytes

The retired single-action model returned only a validated OID, with the comment "Do not return
arbitrary Git output" (`ruleset-freshness-host.mjs:151-154`). The family keeps that property by
giving every member an `output` rule instead of dropping it because the outputs are now varied:

| `output` | Members | Rule |
| --- | --- | --- |
| `oid-line` | `L1` | first whitespace-delimited token must match `^[0-9a-f]{40}$` after lowercasing; emit exactly that token plus a newline, else fail the call |
| `ls-remote-refs` | `N1` | keep only lines whose OID matches `^[0-9a-f]{40}$` and whose ref is either exactly `refs/heads/main` or `refs/tags/NAME` with `NAME` matching `[A-Za-z0-9._/-]+` plus an optional peeled `^{}` suffix; lowercase the OID, normalise the separator to one tab, cap at 4096 lines and 1 MiB; emit the kept lines; record every kept OID in the set `selectedCommitRefspec` validates against |
| `count-pair` | `L6` | must match `^(\d+)\s+(\d+)$` after trimming; emit `<ahead>\t<behind>` plus a newline |
| `single-line-path` | `L2` | first line only, trimmed, capped at 4096 bytes |
| `manifest-bytes` | `L3` | verbatim, capped at 65536 bytes; the caller `JSON.parse`s it at `:53` and reads one field |
| `empty` | `N2`, `L4`, `L5` | emit `""`; the caller reads only `status` for these |

`N1`'s rule is checked against the two consumers it must keep working: the alpha match
`^([0-9a-f]{40})\s+refs/heads/main$` at `:194` and the tag match
`^([0-9a-f]{40})\s+(refs/tags/[^\s^]+)(\^\{\})?$` at `:143`, which is why peeled `^{}` entries are
kept rather than filtered. A line the sanitiser drops is invisible to the caller, which is the
point: nothing outside the family's declared vocabulary crosses back over the boundary.

## 9. Receipt, request hash and privacy

**Request hash.** `requestSha256 = sha256(canonicalJson(request))` over the frozen request
`{schema, boundaryId, action, argv, cwd, timeoutMs, envKeys, access}`, where `argv` is the fully
expanded argv actually to be executed and `envKeys` is the sorted list of environment **key names**
with no values. Canonical JSON means sorted keys, no insignificant whitespace, UTF-8. The digest
therefore binds the exact command without publishing it, which is what lets the receipt and the
refusal record carry a correlatable identity while obeying `PX0-AC-14`.

**Receipt, one per network-class execution** (so at most two per session), extending the existing
shape at `ruleset-freshness-host.mjs:101-114` rather than inventing a different one:

```json
{ "schema": "pipeline.pipeline-update-host-receipt.v1",
  "boundaryId": "pipeline-update-availability-wsl-host.v1",
  "action": "fetch-marketplace-commit",
  "requestSha256": "<64 hex>",
  "hostControl": { "schema": "...", "code": "CAS-READY", "appServerVersion": "...", "daemonIdentitySha256": "<64 hex>" },
  "childStarted": true,
  "executable": "/usr/bin/git",
  "argv": ["--git-dir", "<temporaryGitDir>", "-c", "maintenance.auto=false", "fetch", "--quiet",
           "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head",
           "https://github.com/agent-pipe-shared/agent-pipeline.git",
           "<oid>:refs/pipeline/marketplace"],
  "exitCode": 0,
  "access": "remote-read-only, local-write: comparison-repo",
  "observed": { "refs": 1 } }
```

**The receipt's `argv` is redacted by slot, not verbatim — and this is a real difference from the
single-action model.** The retired receipt could carry its argv literally
(`ruleset-freshness-host.mjs:110`) because that argv was three public constants. `N2`'s argv
contains `temporaryGitDir`, a local filesystem path, which
`docs/phoenix-governance-threat-model.md:16` forbids in action or result diagnostics. The rule is
therefore: a slot whose domain is public (`marketplaceUrl`, `channelSelector`, the OID inside
`selectedCommitRefspec`) appears verbatim; every other slot appears as its bracketed slot name.
Literals always appear verbatim. `requestSha256` still binds the unredacted request, so the
redaction costs no binding strength.

`hostControl` is unchanged from `hostControlBinding` (`ruleset-freshness-host.mjs:83-99`), which
already publishes only a version string and a digest. `observed` carries counts only — never
content, never a path, never an environment value.

**Privacy invariant, stated so it can be tested (§12, `NEG-7`):** no receipt, refusal record or
error message emitted by the family may contain the `temporaryGitDir` value, the
`loadedPluginRoot` value, any environment variable value, or any byte of `stderr`.

## 10. Threat-model mapping and required amendments

### 10.1 Asset row "Host network capability" (`docs/phoenix-governance-threat-model.md:15`)

Required control today: *"WSL/restricted preflight binds one network-open, read-only host action by
boundary ID and request hash."*

**How the family preserves it.** The binding mechanism is unchanged and applied per request rather
than per boundary: every network-class request carries the boundary id (§3) and a `requestSha256`
over its complete expanded argv and execution profile (§9), and the executor re-observes the
App-Server control identity before it spawns anything, exactly as
`executeRulesetFreshnessHostAction` does today (`ruleset-freshness-host.mjs:130-135`). What
changes is the cardinality — one bound action becomes two — and the family keeps the property that
made the single action bindable: the set of executable argvs is finite, enumerated in module-
private frozen tables, and every non-literal position resolves to a pinned constant, a two-value
enumeration, or a value the adapter itself observed (§4.1). "One action" was never the control;
"no argv the reviewer has not seen" was, and that survives the widening.

**What would break it.** Any slot whose domain is not enumerable or not adapter-pinned — most
concretely, letting `marketplaceUrl` accept whatever `.claude/settings.json` yields, which would
hand the network boundary to an editable file. Reusing one `requestSha256` for more than one
execution. Letting the caller supply the boundary id, the timeout or the environment. Adding a
third network member without the `v2` review §3 requires. Each of these is a change to the module,
not to a call site, which is why the tables are where they are.

**Amendment required (substance only; §B.6 assigns exact wording to the implementation dispatch):**
the row must say that the preflight binds a **closed two-member** network-open host action family
by boundary ID and per-request hash, that both members are read-only toward the remote, and that
one of them writes only into the adapter-bound disposable comparison repository.

### 10.2 Mitigation "No direct fallback after restricted preflight" (`:31`)

Recovery today: *"Return `host-transport-required` with the fixed bound action."*

**How the family preserves it.** Two independent mechanisms rather than one. Mechanically: the
matcher has no fallthrough — an unmatched request produces the typed refusal of §6 and no process
is created, so the restricted sandbox cannot reach the network by handing the adapter something it
does not recognise. Structurally: the network executor's module imports no spawner at all (§7.2),
so even a matched network request cannot be served locally when the transport is missing; it
becomes a `transport-unavailable` refusal. The composition root's refusal to construct without a
transport (§7.4) keeps the no-adapter case on today's plain path rather than on a half-built one.

**What would break it.** A `default:` branch forwarding unknown argv to `spawnSync` "because it
looked local". Giving the network executor a `spawnSync` import as a fallback for a missing
transport. Giving the local executor a transport parameter. Treating a refusal as a signal to
retry the same command unwrapped — which is precisely the abuse case this row exists for, and the
reason §6 routes refusals into the caller's existing `unknown` reasons instead of into a retry.

### 10.3 The operating rule at `:61-63` — falsified in three ways, and §B.6 flags only one

The paragraph states: *"The productive WSL adapter has no durable state, lockfile, repository
mutation, or fallback executor. It performs one public observation from the fixed host directory
and returns only a validated public object ID plus the privacy-safe host-control identity
digest."* Against the family: (i) it performs up to **two** public observations per session, not
one; (ii) `N2` **mutates** a repository — the adapter-bound disposable bare repo (§8.2); (iii) it
returns a sanitised ref listing, a manifest byte range and a count pair, not only a validated
object ID. Only "no fallback executor" and "no durable state or lockfile" survive unchanged, and
both are strengthened rather than weakened (§7.2, and the per-instance lifetime in §5 rule 6).

§B.6 flags this paragraph only for the export names in its rollback-unit sentence. The three
falsifications above are a distinct, larger edit, and they are the reason this design hands the PO
one open question (§13) instead of quietly rewriting a governance sentence. The rollback unit
itself also grows: `ruleset-freshness-host.mjs`, its binding in `ruleset-freshness.mjs`, the three
new modules (§7), the suite (§12), and this document.

### 10.4 The remaining rows the family touches

`:32` copied/stale request — preserved and strengthened by the new boundary id (§3) plus the
per-request hash. `:33` ambient `PATH`/config/URL rewrite — preserved verbatim for the network
class (literal `/usr/bin/git`, cwd `/`, `WSL_SYSTEM_GIT_ENV`) and newly extended to the local class
(§8.1 note 1). `:34` private source gains public-freshness authority — preserved by the one-value
`marketplaceUrl` domain (§4.1). `:35`/`:36` forged host output — preserved by requiring the result
schema, the exact request hash and the control-identity digest, and tightened by the per-member
output sanitisers (§8.3), which now also constrain the *shape* of what a compromised host may
return. `:41` diagnostic leaks private topology — preserved by §9's redaction rule and the
testable invariant at the end of §9.

## 11. Acceptance criteria this design serves

Located in `specs/sprint-phoenix-epic/acceptance.md` (section "PX0 — Lifecycle-authority revision
and runner-neutral ruleset source/freshness"), not assumed:

- **PX0-AC-13** (`acceptance.md:86-89`) — *"WHEN remote freshness needs networking on a host with a
  known network-denied workspace sandbox, THE SYSTEM SHALL use the selected network-open/read-only
  host transport without consuming a known-failing sandbox attempt."* This is the criterion the
  family exists to make satisfiable: `N1` and `N2` are the two calls a Codex+WSL sandbox cannot
  complete, and they are the two that route through the transport, with no prior sandbox attempt.
  The threat model's mapping table calls this row **AC13 — transport binding**
  (`docs/phoenix-governance-threat-model.md:116`).
- **PX0-AC-14** (`acceptance.md:90-92`) — *"WHEN source/freshness diagnostics are rendered or
  persisted, THE SYSTEM SHALL omit tokens, credentials, home paths, cache paths, private remotes,
  SSH key paths, and account coordinates."* Served by the slot-redacted receipt argv, the
  path-free refusal record and the fixed error message (§9), and pinned by `NEG-7` (§12).
- **PX0-AC-11** (`:80-82`) and **PX0-AC-12** (`:83-85`) — the common closed contract and the
  distinct typed status on missing or disagreeing identity. Served by §6: every refusal maps onto
  an existing typed status and none infers equality.

## 12. Test plan

One suite, `plugins/pipeline-core/scripts/ruleset-freshness-host-actions.test.mjs`, registered in
`harness/scripts/verify.mjs`'s suite list beside the existing `ruleset-freshness-tests` entry
(`verify.mjs:179`; `pluginScriptsDir` is defined at `:68`). Placing it in `scripts/` rather than
next to the modules keeps it in the directory the registry already indexes. **This document does
not write the suite.**

**Positive, per member (8 cases, `T-N1`, `T-N2`, `T-L1`…`T-L6`).** For each: the exact argv taken
from the real call site matches exactly one descriptor; the resolved descriptor is in the expected
table; the executed profile equals the declared one (`cwd`, timeout, sorted env key set,
executable/route); and the sanitised output equals the declared canonical form for a
representative raw output. `T-N1` runs twice, once per `channelSelector` value.

**Slot boundaries (`T-SLOT-*`).** Uppercase and 39-character OIDs rejected; a `selectedCommitRefspec`
whose OID was never in `N1`'s recorded set rejected; `temporaryGitDir` with a `..` segment, with a
parent other than the process tmpdir, or with a basename outside the pinned pattern rejected; a
second `L5` rejected as `call-budget-exceeded`; `N2`/`L3`/`L4`/`L6` before `L5` rejected as
`precondition-unbound`; `marketplaceManifestRef` with any other path rejected.

**Negative controls — assertions that must fail to match, or must not cross a class boundary:**

- `NEG-1` — `["ls-remote", <allowlisted url>, "refs/tags/*", "--exit-code"]` is refused. A trailing
  argument must not be absorbed; this is the arity rule.
- `NEG-2` — `["ls-remote", "https://example.invalid/other.git", "refs/heads/main"]` is refused.
  The URL domain is one value, not a shape.
- `NEG-3` — `["ls-remote", <allowlisted url>, "HEAD"]` is refused. This is the *retired single
  fixed action* (`ruleset-freshness-host.mjs:138`); the new family must not accept the old
  contract's argv.
- `NEG-4` — with `hostTransport` present but the injected local spawner spied, `N1` and `N2`
  execute and the local spawner records **zero** calls. A network shape never reaches `spawnSync`.
- `NEG-5` — a `LOCAL_ACTIONS` descriptor passed directly to the network executor is refused by the
  identity check, and the transport records zero calls. A local shape never crosses the network
  channel.
- `NEG-6` — source-level: the network executor module's text contains no `node:child_process`
  import. Structural claim §7.2, asserted structurally.
- `NEG-7` — privacy: for a fixture whose `temporaryGitDir` and `loadedPluginRoot` are unique
  sentinel strings, no emitted receipt, refusal record or error message contains either sentinel,
  any environment value, or any `stderr` byte.
- `NEG-8` — `command` values `"/usr/bin/git"`, `"git.exe"` and `"sh"` are all refused with
  `unmatched-command`, including when `args` is a valid member argv.
- `NEG-9` — a refusal's `error.code` is not `ETIMEDOUT`, so the caller cannot classify it as a
  timeout (`ruleset-freshness.mjs:191`).

**Family-level (`T-DRIFT`, the test that keeps this document true).** Run the real
`inspectPipelineUpdateAvailability` end to end with `options.spawn` set to a recording adapter and
fixtures that carry it through the alpha path and the stable path; assert that **every** observed
`(command, args)` pair matched a member, that the union of matched members equals the family, that
each was called at most once, and that the network/local split is 2/6. This converts §B.3's claim
that the family covers every operation the caller performs into a failing test the day someone
adds a ninth git call to `ruleset-freshness.mjs`.

**Caller-degradation (`T-DEGRADE`, 8 cases).** For each member in turn, force a refusal and assert
the caller's final `status`/`reason` equals the row in §6's table. This pins the fail-open promise
to observed behaviour rather than to the reading of the control flow done here.

## 13. Deviations from the parent design, and the open question for the PO

**Deviations, disclosed rather than built in silently.**

1. The local class does not run under "the ordinary, unrestricted local `spawnSync`" as §B.3 words
   it; it runs under an adapter-pinned profile (§8.1). Strictly more restrictive, outcome-
   preserving, and the reason is that discarding the caller's third argument is what makes §5
   rule 7 true for all eight members instead of six.
2. The family binds a **new** boundary id rather than reviving `WSL_FRESHNESS_BOUNDARY_ID` (§3).
   §B.3 did not decide this either way; the reasoning is in §3 and follows threat-model row `:32`.
3. `marketplaceManifestRef` is pinned to a literal, which makes the existing
   `options.marketplaceManifestPath` seam inert on the Codex+WSL path (§4.1).

**Open question, owner: PO.** §10.3 establishes that the family falsifies the threat model's
operating-rule sentence at `:61-63` in three ways, one of which is a security-posture change and
not an editorial one: the productive WSL adapter acquires a bounded **local write** (objects plus
one ref, into an adapter-bound disposable bare repository under the process tmpdir) where the
sentence today reads "no ... repository mutation".

- **Option A (recommended): accept the bounded write and amend the sentence.** Cost: a crisp
  invariant ("no repository mutation") becomes a qualified one ("no mutation outside one
  adapter-bound disposable comparison repository, with a fixed destination ref and an
  adapter-observed source OID"). A qualified invariant is weaker to reason about and must be
  re-checked at every future change to `N2`. Benefit: Part B works. Recommended because the write
  is the `fetch` at `:333`, and the alternative below shows there is no version of Part B without
  it.
- **Option B: keep the sentence literally true — network class carries `N1` only, `N2` is
  refused.** Cost: `inspectPipelineUpdateAvailability` returns `unknown` with reason
  `remote-object-unavailable` at `:350-360` on every Codex+WSL session, for every channel,
  including the ones where the tag name already carries the version — because the caller fetches
  before it compares and §B.8 forbids changing that orchestration. Part B would ship the
  attestation machinery and deliver exactly today's outcome. Benefit: the host boundary keeps a
  zero-write posture.
- **Option C: change the caller so the fetch is unnecessary for tag channels.** Explicitly
  forbidden by §B.8 ("main's channel/tag-based `inspectPipelineUpdateAvailability` stays the one
  freshness orchestration model"), listed only so the PO sees that it was considered and why it is
  not on the table for this design.

The two threat-model edits §B.6 already assigns to the implementation dispatch (`:15` and the
rollback-unit sentence) are unaffected by this choice in kind, only in wording; §B.8's open item is
their tracking entry, and §10 supplies the substance for all three.

## 14. Verification log

Commands and reads actually performed for this document; no claim above rests on the parent
design's word about current code.

- Read `plugins/pipeline-core/scripts/ruleset-freshness.mjs` in full (443 lines) — grounds §2's
  table, the at-most-once property, the result-shape subset, and every line citation in §4-§6.
- Read `plugins/pipeline-core/scripts/ruleset-freshness-host.mjs` in full (243 lines) — grounds the
  host-control-attestation pattern, `WSL_SYSTEM_GIT_ENV`, the single-fixed-action model at
  `:110`/`:138`, the receipt shape at `:101-114`, and §1's list of unresolved imports.
- Read `plugins/pipeline-core/lib/public-core-origin-allowlist.mjs` — established that the module
  §A.3 item 1 specifies already exists and that GS-8 protects it (§2.1 item 1).
- Read `docs/phoenix-governance-threat-model.md` in full — grounds §10's row citations, including
  the operating-rule paragraph §B.6 does not cover.
- Read `specs/sprint-phoenix-epic/acceptance.md` PX0 section — grounds §11's verbatim quotations.
- `rg -n "resolveMarketplaceUrl" -A 30 plugins/pipeline-core/hooks/staleness-check.mjs` — confirmed
  the marketplace URL reaching `N1`/`N2` is derived from `.claude/settings.json`, which is why
  §4.1 pins it to a one-value domain.
- `rg -n -e "pluginScriptsDir" -e "const SUITES" harness/scripts/verify.mjs` — grounds §12's
  registration anchor (`:68`, `:179`).
- Not run: the repository verify gate, deliberately — another process held the candidate lock
  during this dispatch. The docs-contract checker was run instead; see the dispatch record.
