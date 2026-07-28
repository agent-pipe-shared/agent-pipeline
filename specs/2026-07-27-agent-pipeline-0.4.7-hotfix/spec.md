# Technical specification — Agent Pipeline 0.4.7 hotfix

Status: `approved by PO on 2026-07-28; implementation authorized`.

This specification implements the neighboring
[PRD](prd_agent-pipeline-0.4.7-hotfix.md) against exact base
`9d1b3dc108eb77629ace5b82002120f5539abd8d`. It is intentionally independent
of Sprint Nova and Pull Request #64.

## 0. Candidate audit baseline — 2026-07-28

The audited candidate is `af71c2e18226da8527c94a359fbd343500c6d5b0` on
`hotfix/issue-73`, observed 15 commits ahead of and zero commits behind
`origin/main` at the declared base. This baseline records implementation state;
it is not a plan approval, release claim, or authorization to dispatch.

- `047-LCY` is present with focused host evidence. Its first independent
  Critic round failed for missing persisted-State postimage validation and a
  rollback path; the follow-up adds both. That follow-up still requires a fresh
  candidate-bound Critic review and all applicable candidate gates.
- H3 and H4 remain planned work: the current tree does not yet expose the
  specified `plan-source-recovery`, `plan-manifest-repair`,
  `apply-manifest-repair`, or WSL IPC compatibility controller surfaces.
- H5 remains incomplete: the active host-Advisor route still declares
  60,000/45,000 ms attempts, not the required 180,000/90,000 ms policy.

Every acceptance criterion below therefore remains required. No existing
focused evidence may be reused as candidate, release, platform, or approval
evidence after any subsequent candidate change.

## 1. Invariants

The implementation must preserve these release-wide invariants:

1. `pipeline.user.yaml` remains authoritative; generated projections are never
   hand-edited or guessed.
2. Read-only planning is deterministic and causes no write.
3. Every durable or persistent-state writer is exact-target,
   explicit-confirmation, digest-bound, drift-detecting, recoverable, and
   followed by readback.
4. V4 readiness remains fail-closed.
5. The lifecycle guard admits only behavior proven by its parsed command
   structure; raw substring tests cannot grant or deny authority.
6. Windows support relies on native identity and access-control evidence, not
   synthetic POSIX mode bits.
7. A compatibility profile may narrow a known host incompatibility but cannot
   become a general privilege escalation.
8. Reference commits from Nova are read-only design/patch inputs. Their state,
   evidence, history, and unrelated implementation never enter the hotfix.
9. A model-free diagnostic may create only its declared nonce-bound temporary
   resources, must prove canary preservation and complete cleanup, and may
   never turn temporary-resource creation into a durable-state success claim.
10. Runtime routing consumes a closed structured failure projection, never
    human log text. Troubleshooting logs are bounded, owner-private,
    machine-local, sanitized, and cannot become activation authority.
11. A legacy continuity authority can change only through a dedicated
    exact-preimage transition. Generic CAS, ordinary feature replacement, and
    manual State editing remain unable to adopt a Result or rewrite PRD
    authority.

## Acceptance criteria (EARS)

These criteria are the normative implementation and release contract. The
later technical sections explain how the system satisfies them.

- **AC-047-01 — Backlog admission:** WHEN the canonical backlog checker reads
  the 0.4.7 candidate, THE SYSTEM SHALL find exactly one valid initial
  `null -> open` event for `pipeline.managed-onboarding-success-contract` and
  SHALL keep the item status `open`.
- **AC-047-02 — Backlog transaction:** WHEN the missing-event writer observes
  any item, status, digest, ledger-head, or additional-finding drift, THE SYSTEM
  SHALL refuse the repair without a partial ledger/projection change.
- **AC-047-03 — Source recovery:** WHEN V4 reports `source_invalid`, THE SYSTEM
  SHALL return the exact read-only source-recovery planner and that planner
  SHALL end in one sanctioned workflow or a typed terminal disposition.
- **AC-047-04 — Manifest recovery:** WHEN a current Codex-selected V3 source
  has no generated manifest, THE SYSTEM SHALL offer a deterministic
  absent-manifest plan and an explicitly confirmed digest-bound apply action.
- **AC-047-05 — Existing manifest preservation:** WHEN any manifest target
  already exists, THE SYSTEM SHALL return a typed unrepairable disposition and
  SHALL preserve the target's bytes and identity.
- **AC-047-06 — Publication race:** WHEN source, target, parent, or publication
  identity drifts during manifest apply, THE SYSTEM SHALL reject success and
  SHALL remove/quarantine only the exact writer-owned generated inode.
- **AC-047-07 — Recovery readback:** WHEN manifest apply completes, THE SYSTEM
  SHALL report success only after a fresh V4 inspection accepts the resulting
  state.
- **AC-047-08 — Pre-ready authority:** WHILE V4 is not ready, THE SYSTEM SHALL
  admit only the exact shipped recovery planners, exact V3 authority validator,
  exact digest-bound manifest writer, and pre-existing sanctioned lifecycle
  commands.
- **AC-047-09 — Windows token fidelity:** WHEN the guard parses a native Windows
  command, THE SYSTEM SHALL preserve single backslashes, drive/UNC paths,
  quoted spaces, and direct `node.exe` argv values without applying POSIX
  escape semantics.
- **AC-047-10 — Fixed PowerShell read:** WHEN PowerShell requests
  `Get-Content -LiteralPath <exact-loaded-SKILL.md> -Raw`, THE SYSTEM SHALL
  admit that read and SHALL deny aliases, extra paths, missing `-Raw`,
  expressions, chaining, redirection, or write forms.
- **AC-047-11 — Bounded read pipeline:** WHEN a diagnostic has the approved
  `rg ... 2>/dev/null | head ...` or Windows-null-device shape, THE SYSTEM
  SHALL classify it as read-only only after every segment, operator, redirect,
  bound, and path passes its closed validator.
- **AC-047-12 — Unsupported shell syntax:** WHEN command syntax is unsupported
  or a segment/operator/redirect is unapproved, THE SYSTEM SHALL deny it with a
  typed reason and SHALL NOT relabel it as cross-repository mutation solely
  because quoted/raw input contains `<` or `>`.
- **AC-047-13 — Trusted Windows executable:** WHEN native Windows resolves the
  restart executable, THE SYSTEM SHALL admit only a physical digest-bound
  direct `codex.exe` and SHALL reject `.cmd`, `.bat`, wrappers, unsafe links,
  aliases, and shell-mediated launch.
- **AC-047-14 — Private restart state:** WHEN restart state is created or read
  on native Windows, THE SYSTEM SHALL require shared owner-only DACL/owner/
  physical-path/reparse-point assurance; WHEN it runs on POSIX, THE SYSTEM
  SHALL retain exact `0700`/`0600` assurance.
- **AC-047-15 — Restart diagnostics:** WHEN executable binding, private-state
  persistence, barrier, launch-ticket, or readback fails, THE SYSTEM SHALL
  preserve a distinct sanitized phase/code and SHALL NOT misattribute every
  failure to barrier persistence.
- **AC-047-16 — Native-first session:** WHEN a new WSL session starts, THE
  SYSTEM SHALL route its first eligible real operation through the native
  standard sandbox regardless of platform/version, installed fallback profile,
  or prior-session evidence.
- **AC-047-17 — Reactive IPC trigger:** WHEN and only when the current session's
  real native operation returns either the typed
  `unix_socket_bind_denied` cause or a structurally plausible
  `sandbox_permission_denied_unknown` with OS code `EPERM`, THE SYSTEM SHALL
  preserve that original result and run the fixed model-free compatibility
  verifier without parsing stderr.
- **AC-047-18 — IPC confirmation:** WHEN the verifier runs, THE SYSTEM SHALL
  classify the workaround as confirmed only if workspace temporary-file
  creation succeeds and AF_UNIX listen/bind reproduces a structured
  `local-ipc` + `af-unix-socket` + `EPERM` result; THE SYSTEM SHALL propagate
  that typed cause through every supported adapter and append its sanitized
  lifecycle events to the bounded machine-local session log; unrelated
  `EPERM`, stderr text, unknown errors, or cleanup/canary failure SHALL NOT
  activate the fallback.
- **AC-047-19 — Profile transaction:** WHEN the compatibility profile is not
  installed, THE SYSTEM SHALL require exact preview, explicit approval,
  digest-bound apply, strict Codex config validation, and readback before the
  profile can be selected.
- **AC-047-20 — Session-only fallback:** WHEN the native IPC failure is
  confirmed and an unchanged dormant profile carries an exact prior operator
  approval receipt, THE SYSTEM SHALL automatically select it only for the
  closed eligible operation classes later in the current session and SHALL NOT
  set global defaults or affect a later session.
- **AC-047-21 — Safe retry:** WHEN the triggering operation is proven
  read-only within an eligible general workspace duty, deterministic, and free
  of partial effects, THE SYSTEM MAY retry it once under the validated profile;
  OTHERWISE THE SYSTEM SHALL preserve the original non-success and use the
  profile only for a later eligible operation.
- **AC-047-22 — Automatic retirement:** WHEN a later session's native sandbox
  succeeds because Codex or the environment is fixed, THE SYSTEM SHALL not run
  the verifier or select the dormant compatibility profile.
- **AC-047-23 — Narrow-duty isolation:** WHEN Advisor, readiness, Critic,
  review, validation, or security duties run, THE SYSTEM SHALL use their
  independently required narrow profiles and SHALL NOT inherit the WSL
  compatibility profile.
- **AC-047-24 — Advisor budgets:** WHEN bootstrap invokes the Codex Advisor,
  THE SYSTEM SHALL allow one 180,000 ms primary attempt and one 90,000 ms
  fallback attempt while retaining the existing models, efforts, isolation,
  digest checks, maximum attempt count, and non-blocking exhaustion result.
- **AC-047-25 — Nova exclusion:** WHEN the 0.4.7 candidate diff is audited, THE
  SYSTEM SHALL contain none of PR #64's Nova state, lifecycle, specs, backlog
  evidence, candidate evidence, or unrelated implementation.
- **AC-047-26 — Release evidence:** WHEN 0.4.7 is declared releasable, THE
  SYSTEM SHALL bind focused, native-platform, Full Verify, Security, Critic,
  packaged-plugin, installed-readback, standard-vs-compatible IPC probe,
  version, and downstream-rebase evidence to the same exact candidate commit
  and tree.
- **AC-047-27 — Legacy continuity adoption:** WHEN the exact released
  `codex-onboarding-0.4.5` continuity-adoption preimage is presented with its
  reachable historical PRD, current repository-scoped PO approval, unchanged
  Spec, existing Result, close evidence, and remote-read-back `v0.4.6`
  commit/tree, THE SYSTEM SHALL offer one read-only digest-bound plan and,
  only after explicit confirmation, atomically reconcile the PRD authority,
  bind the Result, and advance the queue to `close`; any drift, broader state,
  missing evidence, replay conflict, or durability ambiguity SHALL fail
  closed without a false zero-mutation or success claim.
- **AC-047-28 — PO authority rebind:** WHEN a regular in-root PRD has a valid
  older `technical-spec-sha256` marker while the current regular in-root Spec
  is newer and `planApproval.poGateAuthority` plus `continuity.authority`
  retain the older PRD/Spec bindings, THE SYSTEM SHALL offer one read-only,
  closed `pipeline.po-authority-rebind-plan.v1` plan that binds the current
  PRD and marker, current Spec, State revision, plan-approval/PO-gate and
  continuity authority, and every file/State preimage. Only an explicit PO
  confirmation of that exact plan SHA-256 may run its complete apply action.
  Apply SHALL atomically rewrite the PRD marker, planApproval and
  poGateAuthority bindings, and continuity PRD/Spec bindings to one matching
  postimage set, then read them back through PO-gate authority, Continuity and
  V4 inspection. Drift, identity/permission/DACL failure, write failure,
  partial durability, mixed postimage, or unauthorized replay SHALL roll back
  completely and fail closed. An interrupted pair of complete postimage bytes
  SHALL also roll back to the journal-bound preimage bytes and require a fresh
  plan; postimage byte equality cannot authenticate path identity after a
  same-bytes inode replacement. The transition SHALL use existing
  cross-platform private-state assurance, reject links/reparse points and
  non-regular files, and SHALL NOT widen generic authority, force-close a
  feature, or permit a manual State repair.
- **AC-047-29 — Closed-feature re-entry:** WHEN the sanctioned State writer
  has completed `close-feature` and removed active Continuity, THE SYSTEM SHALL
  classify that exact closed audit shape as a valid re-entry boundary rather
  than damaged Continuity. After the sanctioned `set-feature` writer selects
  the next feature, its exact unapproved `design` shape without Continuity
  SHALL remain valid while PRD/Spec approval is prepared. Bare inactive State,
  malformed closed audit entries, active non-design shapes, lingering
  approval/Continuity fields, cleanup residue, or invalid close artifacts
  SHALL remain fail-closed. The complete
  `close-feature -> V4 ready -> set-feature -> V4 ready` path SHALL be covered
  by a process-level test without a manual State edit or guard bypass.

## 2. Change boundary

### 2.1 Expected production surfaces

The implementation is expected to modify or add only the following production
families, plus their matching schemas/tests and maintained documentation:

- `backlog/transitions.ndjson`, `backlog/STATUS.md`, `backlog/index.json`;
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`;
- a hook-local command grammar module if extraction is required;
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs`;
- `plugins/pipeline-core/lib/continuity-state.mjs`;
- `plugins/pipeline-core/lib/codex-onboarding-runtime.mjs`;
- shared Windows private-state boundary modules already present under
  `plugins/pipeline-core/lib/`;
- a new WSL IPC compatibility/profile transaction module under
  `plugins/pipeline-core/lib/`;
- a closed sandbox-failure projection and bounded machine-local IPC diagnostic
  log module under `plugins/pipeline-core/lib/`;
- `plugins/pipeline-core/scripts/project-onboarding-v3.mjs`;
- `harness/scripts/pipeline-state.mjs`;
- a new model-free WSL IPC compatibility CLI under
  `plugins/pipeline-core/scripts/`;
- `plugins/pipeline-core/scripts/codex-host-advisor-route.mjs`;
- `plugins/pipeline-core/skills/pipeline-start/SKILL.md`;
- `docs/codex-onboarding-threat-model.md`;
- the Verify registry, release readiness, version, manifests, and changelog at
  the gated release stage; and
- this hotfix's own result/evidence artifacts.

### 2.2 Forbidden transfer surfaces

The implementation must not copy or modify as part of the #63 transfer:

- `.claude/pipeline-state.json`;
- `specs/sprint-nova-epic/**`;
- Nova backlog items, transitions, receipts, or evidence;
- Nova changes to `docs/state.md`;
- Nova worker, supervisor, forge, Antigravity, or runner-capability modules; or
- commit/PR metadata intended to make the hotfix look descended from PR #64.

The pipeline session may update its own sanctioned runtime binding in
`.claude/pipeline-state.json`; that operational change is not #63 candidate
content and must be excluded from the implementation commit.

### 2.3 H0 — Exact legacy continuity adoption

`047-LCY` is the sole implementation slice allowed before the 0.4.7 plan can
become the active State authority. It is still implemented by one fresh
bounded Goldfish dispatch after the PO approves these final PRD/Spec bytes.
No other hotfix slice may start until the old feature is closed and the 0.4.7
feature is set, approved, bound to this Spec, and read back in
`implementation`.

The read-only planner accepts only this complete preimage:

- State schema `pipeline.state.v0`, active feature
  `codex-onboarding-0.4.5`, its exact plan path, phase `implementation`, and
  `planApproved:true`;
- a valid `pipeline.plan-approval.v2` whose physical PRD/Spec paths and hashes
  are `217eff325fffa5d82d5d49f31883c426dca74c42879aaae0a70da87be8e492ae`
  and `5a95aa55b393a88e0d7ab1a8006957fc04d80bcae24399b40f3ffa8e4eb3cf70`;
- continuity schema `pipeline.continuity.v0`, matching feature, revision `3`,
  PRD authority
  `9825ca78a3765dc71ee2793ef9f84f2eaf998bf297086d869be3562d792cdb94`,
  identical Spec authority, `result:null`, package
  `continuity-adoption`, action `review-active-feature`,
  `nextAction:review`, both retry counters zero, and no dispatch, blocker,
  acknowledgement, recovery, decision transaction, or close transition;
- the historical PRD digest at the same path is reachable at
  `7a62a4ef9febba844cf5be8a659177b37c6a5da5`, and the final approved PRD,
  unchanged Spec, and Result are physical regular in-root files;
- Result path
  `specs/2026-07-25-codex-onboarding-0.4.5/result.md` and digest
  `ceed30ddce48d921f2afbbb44d02a3fe5301302ad07fab3f41dfbc149f657b73`;
  and
- annotated release tag `v0.4.6`, local and remote tag-object/readback
  agreement, dereferenced commit
  `9d1b3dc108eb77629ace5b82002120f5539abd8d`, tree
  `282a8b5c5b0581e042985bfb373a66be0eb2d08b`, plus a physical
  hash-bound close-evidence file recording those facts.

The planner returns a closed
`pipeline.continuity-result-adoption-plan.v0` envelope with exact root,
preimage State digest, expected revision, artifact bindings, release
bindings, `planSha256`, and one complete apply action marked
`mutation:true` and `requiresConfirmation:true`. Planning writes nothing.

The apply command requires the same request plus `--plan-sha256` and
`--activate`, recomputes the entire plan, acquires the existing continuity
writer lock, and revalidates every file, Git, remote, and State precondition.
Its pure transition increments the continuity revision once, replaces only
the historical continuity PRD artifact with the already approved current PRD
artifact, binds the existing Result artifact, and changes only
`queueHead.nextAction` from `review` to `close`. Runtime/session cleanup,
Spec, package/action identifiers, counters, resume, capacity, and all null
control fields remain byte-equivalent.

After atomic durable write/readback, descriptor-bound session cleanup writes
its closure receipt and CAS-releases the exact runtime binding, advancing
Continuity once more to revision `5`. The existing
`pipeline.continuity-close.v0` request binds that post-cleanup revision, the
same Result, and close evidence, and the ordinary `close-feature` writer
removes the old active feature and continuity. The normal writers then set
`agent-pipeline-0.4.7-hotfix`, bind the final PRD and Spec hashes, record PO
approval, set phase `implementation`, and read back repository-scoped PO
authority. Neither the adoption transition nor close automatically activates
the new feature.

Tests cover the exact transition and zero-mutation refusal for every changed
precondition: wrong feature/revision/queue/control field, unbound or
unreachable historical PRD, current PRD/Spec/approval mismatch, absent or
changed Result/close evidence, lightweight/wrong/moved tag, local/remote
tag-object or dereferenced commit/tree mismatch, State/HEAD drift between plan
and apply, lock contention, replay and conflicting replay, symlink/non-regular
artifacts, pre-rename failure, post-rename durability ambiguity, and ordinary
CAS remaining `CS-PROTECTED-AUTHORITY`.

## 3. H1 — Canonical backlog admission

### 3.1 Exact event

Append one `pipeline.backlog-transition.v1` event for
`pipeline.managed-onboarding-success-contract`:

- `from: null`;
- `to: open`;
- actor identifies the bounded 0.4.7 missing-initial-ledger repair;
- reason states that the event admits the existing open item and claims no
  implementation or closure;
- evidence binds the exact item path, its SHA-256, and the exact reachable base
  commit used for the repair;
- `sequence` is the next ledger sequence;
- `previousHash` equals the current ledger head; and
- `entryHash` is computed by the canonical transition hash.

The existing Markdown item bytes must remain unchanged.

### 3.2 Writer

Do not append by an unverified freehand write. Extend or reuse the existing
recoverable missing-initial-event transaction so it:

1. accepts only the single checker finding for the target item;
2. verifies exact item identity/status/digest and current ledger head;
3. plans ledger plus deterministic STATUS/index projections;
4. journals all preimages;
5. atomically writes the complete target set;
6. recovers the whole preimage set after any partial failure; and
7. reruns the canonical checker.

### 3.3 Tests

Tests cover exact success, wrong item, wrong status, changed item bytes, changed
ledger head, additional checker findings, partial write failure, journal
recovery, repeated apply, and deterministic projections.

## 4. H2 — Closed guard command grammar

### 4.1 Parser result

Replace `parseSimpleShellWords()` with one closed parser whose result is:

```text
pipeline.guard-command.v1
  dialect
  segments[]
    executable
    argv[]
  operators[]
  redirects[]
    segment
    fd
    direction
    target
  parseStatus
  denialCode
```

The result is internal immutable data; it need not be serialized unless tests
or diagnostics already require serialization.

Supported dialect classes are:

- `posix-simple`;
- `posix-readonly-pipeline`;
- `powershell-fixed-read`; and
- `windows-direct`; and
- `windows-readonly-pipeline`.

The parser is closed. Unsupported syntax returns a typed parse denial and no
partially authoritative argv.

### 4.2 Token semantics

For POSIX input:

- single quotes preserve all enclosed bytes;
- double quotes preserve text and reject unsupported expansion/substitution;
- backslash escaping follows the supported simple-command subset;
- `$PWD` and `${PWD}` may expand only as the existing exact-root token;
- operators are recognized only outside quotes;
- command substitution, process substitution, heredocs, backgrounding,
  grouping, multiline commands, `;`, `&&`, and `||` are unsupported; and
- a redirect-like string inside quotes remains argv data.

For Windows-direct input:

- native `\` path separators are ordinary path bytes;
- quoted spaces stay within the same argv value;
- drive-letter, UNC, and absolute paths retain their original separators;
- `node.exe` is recognized only as the direct trusted runtime executable; and
- POSIX escape rules are not applied to native Windows paths.

For PowerShell, do not implement a general grammar. Recognize only the fixed
bootstrap read:

```text
Get-Content -LiteralPath <exact-loaded-SKILL.md> -Raw
```

The command may use the canonical executable name required by the runtime and
normal PowerShell case-insensitivity. It permits no alias, wildcard, provider
path, expression, variable expansion, additional path, pipeline, redirect,
write flag, encoding transform, or trailing operation.

### 4.3 Bounded diagnostic pipeline

The pipeline grammar is exactly:

```text
<rg-search> [2>/dev/null] | head -n <count>
<rg-search> [2>NUL]      | head.exe -n <count>
```

The POSIX form accepts basenames `rg` and `head`; the Windows form accepts
case-insensitive basenames `rg.exe` and `head.exe`. No other executable or
path-qualified substitute is admitted by this pipeline rule.

`<count>` is one canonical base-10 integer from `1` through `500`, with no
sign, leading zero, suffix, second operand, or alternate spelling. This keeps
the observed `head -n 280` class usable while making output and execution
bounded.

`<rg-search>` has one of two closed forms:

```text
rg[.exe] <search-options>* [--] <pattern> <path>*
rg[.exe] --files <file-options>* [--] <path>*
```

Search-mode boolean options are exactly:

```text
-n --line-number -S --smart-case -i --ignore-case
-s --case-sensitive -F --fixed-strings -w --word-regexp
-x --line-regexp -l --files-with-matches -L --files-without-match
--hidden --no-ignore --no-messages
```

Search-mode value options are exactly:

```text
-A --after-context -B --before-context -C --context
-g --glob -t --type -T --type-not -e --regexp
--max-count --max-depth
```

Each value option consumes exactly one following non-empty argv token.
Context, max-count, and max-depth values are canonical decimal integers in
`0..500`. Glob/type values remain data and cannot begin a shell expression.
`-e/--regexp` supplies the pattern; without it, exactly one positional pattern
is required. After the pattern, every positional token is a read path.

Files mode permits only these boolean/value options:

```text
--hidden --no-ignore --no-messages
-g --glob -t --type -T --type-not --max-depth
```

It has no pattern operand. Every remaining positional token is a read path.

For both modes:

- option bundling, `--option=value`, unknown/duplicate semantic options, and
  options that execute preprocessors or external commands are denied;
- each path is empty (meaning current governed root) or passes the existing
  physical project/cross-repository read policy;
- the only operator is exactly one pipe;
- the only redirect is fd `2`, output direction, to `/dev/null` on POSIX or
  case-insensitive `NUL` on Windows, attached only to the `rg` segment;
- stdout/stderr to any other target, stdin redirection, `tee`, `xargs`,
  mutating commands, control operations, and substitutions are denied; and
- the whole pipeline is read-only only if both segments, every operand, the
  operator, redirect, and path policy pass.

Already supported single-command read-only diagnostics remain governed by
their own existing validators. Expanding this pipeline grammar requires a
reviewed spec change.

### 4.4 Guard verdicts

Add typed denial fields internally and include a stable code in the sanitized
human reason:

- `GUARD-PARSE-UNSUPPORTED`;
- `GUARD-SEGMENT-UNAPPROVED`;
- `GUARD-OPERATOR-UNAPPROVED`;
- `GUARD-REDIRECT-UNAPPROVED`;
- `GUARD-PATH-OUTSIDE-AUTHORITY`;
- `GUARD-CROSS-REPO-MUTATION`; and
- `GUARD-LIFECYCLE-NOT-READY`.

`isForbiddenCrossRepositoryMutation()` consumes the parsed structure. If
parsing fails, it may deny unsupported syntax, but it must not relabel the
failure solely because the raw input contains `<` or `>`.

### 4.5 Guard tests

In addition to existing hostile fixtures, test:

- native Windows single-backslash paths;
- quoted paths containing spaces;
- direct `node.exe`;
- exact PowerShell fixed read and near misses;
- the approved `rg`/`head` pipeline with `/dev/null` and `NUL`;
- redirect-looking text inside single and double quoted JavaScript strings;
- multiple pipes, control operators, multiline input, substitutions, tee,
  xargs, stdout redirects, arbitrary redirect destinations, mutating segments,
  and unbounded or malformed `head` counts; and
- outer `codex-pretool-guard` routing, not only the inner helper.

## 5. H2 — Trusted restart runtime

### 5.1 Executable resolution

`resolveRuntimeExecutable()` becomes platform-explicit and returns a bound
descriptor rather than only a path:

```text
pipeline.codex-runtime-executable.v1
  platform
  requestedName
  physicalPath
  sha256
  resolution
```

On POSIX, preserve the existing direct physical executable behavior.

On native Windows:

1. use a controlled PATH split and case-insensitive `PATHEXT` interpretation;
2. consider only direct `codex.exe`;
3. reject `codex.cmd`, `codex.bat`, generic wrapper names, shell aliases, and
   paths resolved through unsafe links/reparse points;
4. require a physical regular file with the expected trusted path assurance;
5. hash the exact executable bytes; and
6. launch the bound path with an argv array and `shell:false`.

The restart barrier stores the physical path and digest already required by
the lifecycle. Currentness recomputes the same descriptor. Test dependency
injection uses the descriptor selected by the fixture; it never falls back to
the developer host's ambient `codex`.

### 5.2 Private restart state

All restart-state directories and files use one shared assurance adapter:

```text
assurePrivateDirectory(path, platform)
assurePrivateFile(path, platform)
```

On POSIX, directories remain exact `0700` and files exact `0600`, with existing
physical/single-link checks.

On native Windows, directory/file admission requires the shared Windows
private-state implementation:

- current user is the owner;
- owner-only DACL is proven;
- no implicit SYSTEM/Administrators/Everyone exception;
- no reparse point;
- canonical physical path;
- expected file/directory kind; and
- fail-closed `unavailable` when assurance cannot be established.

Apply this to the private root, lock, restart barrier, current readback, ticket
directory, and individual tickets. No component may retain a native-Windows
`mode & 0777 === 0600/0700` success criterion.

### 5.3 Diagnostic phases

Do not catch the entire restart lifecycle under one persistence error. Preserve
sanitized typed phases:

- `runtime-executable-resolution`;
- `runtime-executable-binding`;
- `private-root-assurance`;
- `restart-barrier-persist`;
- `runtime-target-transaction`;
- `launch-ticket-persist`;
- `native-runtime-readback`;
- `restart-barrier-clear`; and
- `post-clear-readback`.

The outer V4 result exposes the phase/code without raw private paths, command
output, environment, or inner stack traces.

## 6. H3 — V4 source and manifest recovery (#63)

### 6.1 Reference patch policy

The following references define prior tested behavior but are not cherry-picked
as commits:

| Reference | Transferable concern |
| --- | --- |
| `7de0ec8` | closed source/manifest planners, exact pre-ready guard entries, CLI and process fixtures |
| `bef69f7` | raw source/target binding, pinned parent, hostile outer-adapter tests, threat model |
| `17da0b2` | absent-target-only policy, atomic no-replace publication, inode-bound quarantine |
| `8701961` | consistent injected runtime executable across lifecycle and fixtures |
| `ddd0d6a` | hermetic host-control fixture dependency injection |

Only current-base-compatible hunks are reimplemented. The hotfix tests must
prove the behavior independently.

### 6.2 Source recovery planner

Add:

```text
project-onboarding-v3.mjs plan-source-recovery
  --root <exact physical root>
```

It returns `pipeline.project-onboarding-source-recovery.v1` with exact keys for
schema, status, root, category, source digest, next action, and diagnostics.

Closed categories:

| Observation | Category | Result |
| --- | --- | --- |
| invalid/unrecognized authority | `invalid-authority` | terminal `unrepairable`; external source owner |
| recognized older V3 projection | `stale-generated-projection` | existing V3 inspect/plan/apply |
| recognized legacy source | `unsupported-source-transition` | existing supported migration or terminal disposition |
| pending transaction hides evidence | `unavailable-evidence` | existing preview-attested recovery |
| source is already current | `current-authority` | rerun V4 and follow controlling action |

The planner never writes or synthesizes source authority. Every returned action
contains the complete executable/argv, mutation, confirmation, schema, and
expected-readback contract.

### 6.3 Manifest repair planner

Add:

```text
project-onboarding-v3.mjs plan-manifest-repair
  --root <exact physical root>
```

It returns `pipeline.project-onboarding-manifest-repair-plan.v1` bound to:

- canonical physical root;
- exact `pipeline.user.yaml` path, raw SHA-256, and byte length;
- sole target `.claude/pipeline.yaml`;
- target status `absent`, absent digest sentinel, and zero byte length;
- generated postimage SHA-256 and byte length;
- preservation mode `absent-target-only`;
- pinned physical target parent identity; and
- canonical `planSha256`.

If the target already exists in any form, including invalid bytes, a link, or
unexpected type, the result is terminal `unrepairable` and the target remains
byte/identity unchanged.

### 6.4 Manifest apply

Add:

```text
project-onboarding-v3.mjs apply-manifest-repair
  --root <exact physical root>
  --plan-sha256 <lowercase 64-hex>
  --activate
```

Apply:

1. requires explicit `--activate`;
2. recomputes and authenticates the exact plan;
3. pins and rechecks root, source bytes, target absence, and parent identity;
4. generates the sole manifest into a private temporary physical file;
5. publishes with atomic no-replace semantics;
6. binds the exact generated inode through publication and durability;
7. if source or parent drift appears after publication, quarantines/removes
   only that exact generated inode and never a raced-in replacement;
8. rejects any target that appears concurrently;
9. performs a fresh V4 inspection; and
10. returns success only from that readback.

No rename-over-existing, check-then-replace, manual YAML copy, broad runtime
write, or inferred success is permitted.

### 6.5 Pre-ready guard admission

Before V4 readiness, admit only:

- exact `plan-source-recovery`;
- exact `plan-manifest-repair`;
- exact digest-bound `apply-manifest-repair`;
- exact Pipeline-shipped
  `v3-bootstrap-authority.mjs --root <exact physical root>`; and
- the pre-existing exact lifecycle commands.

All remain single-command argv shapes. The diagnostic-pipeline allowance from
section 4 does not create a general pre-ready command path.

### 6.6 Recovery verification

Focused tests cover:

- every source-recovery category;
- absent-manifest plan determinism;
- wrong digest, missing confirmation, wrong root, raw-source drift, target
  appearance, parent swap, link/hardlink/reparse cases, durability failure,
  publication race, quarantine ownership, and readback failure;
- repeated inspect/plan causing zero writes;
- hostile guard aliases, flags, argument counts, chaining, redirection,
  substitution, and project-local substitutes;
- outer Codex guard behavior; and
- process fixtures for `ready -> source transition -> diagnose/recover ->
  ready` and `current V3 + absent manifest -> plan/apply/readback -> ready`.

### 6.7 PO authority rebind

Add one repository-owned read-only planner and its digest-bound confirmed
apply action for the narrow stale-PRD-marker case in AC-047-28. The planner is
admitted only after it proves an exact current State/PRD/Spec/approval/
Continuity preimage and returns complete argv, expected postimages, platform
assurance requirements, and a `planSha256`. Apply must re-observe every bound
identity, publish the PRD and State changes as one recoverable transaction,
and perform PO-gate, Continuity, and V4 readback before reporting success.
Fixtures cover the exact Nova preimage, plan, PO-confirmed apply, postimage,
interrupted post/post rollback including same-bytes inode replacement, closed
replay refusal and fresh replanning, preimage drift, each transaction write
failure and full rollback, link/path identity and permission failures,
native-Windows DACL assurance, and read-only planning against the Nova
checkout. No Nova file or stash is an apply target.

### 6.8 Closed-feature re-entry

Continuity classification admits two and only two writer-owned transition
shapes in addition to an active valid Continuity:

1. an inactive State with `planApproved:false`, no active feature, approval or
   Continuity fields, a non-empty structurally valid `closedFeatures` audit,
   and `updatedAt` equal to the final close timestamp; and
2. the subsequent `set-feature` State with one exact
   `{id,planPath,phase:"design"}` active feature, `planApproved:false`, and no
   approval or Continuity fields.

Cleanup observation treats the first as closed/unbound and the second as
active/unbound, so retained descriptors still flow through the existing
typed cleanup-recovery planner. Every inactive lookalike, invalid close
artifact, non-design active transition, orphan Continuity, or retained
approval is still damaged. A process-level fixture executes the real State
writer between two V4 inspections and requires `ready` on both sides.

## 7. H4 — WSL IPC compatibility (#71)

### 7.1 State model

The compatibility controller is driven by the current session's observed native
sandbox events and returns
`pipeline.codex-wsl-ipc-compatibility.v1` with one of:

- `standard`;
- `suspected`;
- `probe-required`;
- `confirmed`;
- `remediation-available`;
- `approval-required`;
- `installed`;
- `validation-required`;
- `session-fallback-active`;
- `not-required`; or
- `unavailable`.

The result binds:

- Codex executable path/digest and version;
- platform/filesystem class;
- effective standard permission-profile/config digest;
- fixed probe version and input digest;
- temp-file observation;
- AF_UNIX observation;
- exact `pipeline.sandbox-failure.v1` projection or absent sentinel;
- machine-local diagnostic-log session/digest reference or absent sentinel;
- installed profile digest or absent sentinel;
- session activation status; and
- next action.

Every new session begins in `standard`; persisted profile presence does not
imply active fallback. The first eligible real operation is routed through the
native standard sandbox. The controller does not run an eager probe or select
by platform/version.

Closed operation classes are:

- eligible: `coordinator-workspace`, `implement`, `mechanic`, `deep`, and
  `test_author`, only when their selected baseline is the standard workspace
  sandbox for the exact current workspace roots;
- ineligible: `advisory`, `readiness`, `critic_normal`,
  `critic_high_risk`, `review`, `validation`, `security`, lifecycle
  pre-readiness/recovery, release, and every unknown class.

An eligible class may contain a read-only or mutating command. This operation
property controls retry safety; it does not turn the class into a narrow
read-only duty.

### 7.2 Reactive trigger and model-free verifier

The verifier may start only after the current session observes a structured
failure from a real native standard-sandbox operation in one of two forms:

```text
direct:
  failureCode = unix_socket_bind_denied
  capability = local-ipc
  resourceClass = af-unix-socket
  operation = bind|listen
  osCode = EPERM

plausible-unknown:
  failureCode = sandbox_permission_denied_unknown
  osCode = EPERM
  plausibility = operation-contract-local-ipc

both:
  originLayer = native-standard
  session = current
```

The direct form may come from an inner adapter that retained the Node/Rust/OS
error properties. The unknown form is eligible only when the invoking
operation contract already declares local IPC as a capability; free-form
stderr cannot establish plausibility. A generic process exit, filesystem
permission error, platform/version match, historical receipt, or string
containing `EPERM` is not a trigger.

The verifier is a fixed shipped payload invoked through the same native
standard sandbox
surface the affected duty would use. It has a monotonic total deadline and:

1. creates and removes one fixed-name, nonce-bound temporary regular file
   inside the approved scratch/workspace boundary;
2. creates, binds, closes, and removes one AF_UNIX socket at a bounded path;
3. records typed capability, logical operation, syscall, resource class,
   sanitized location class, and OS error code directly from error properties;
4. proves canary pre/post digests outside the permitted probe paths; and
5. emits no model request, network request, credential read, repository
   mutation, or retained private path.

Classification binds the triggering event and verifier result to the same
session, native sandbox identity, Codex executable/config digest, and probe
version. It is based on a structured child result/exit protocol. Stderr is
diagnostic-only and never determines compatibility.

`confirmed` requires temp-file success plus the exact accepted AF_UNIX
listen/bind `EPERM` incompatibility matching the trigger. Its normalized cause
is `failureCode: unix_socket_bind_denied`, even when the directly observed
runtime syscall label is `listen`. Temp failure, AF_UNIX success,
different/unknown failure, missing child receipt, timeout, changed canary, or
cleanup failure is `unavailable` and does not switch profiles.

The verifier is never invoked when the native operation succeeds or returns a
non-matching failure. This negative path is part of acceptance, so a future
Codex fix automatically leaves the dormant profile unused.

### 7.3 Structured failure propagation and troubleshooting log

Every fixed payload, sandbox process, Codex command, runner adapter, duty
adapter, coordinator, and Elephant-facing action preserves one immutable
`pipeline.sandbox-failure.v1` projection:

```text
schema
failureCode
capability
operation
osCode
syscall
resourceClass
locationClass
runnerClass
adapterTrace[]
originLayer
permissionPosture
evidenceSource
probeVersion
retryClass
partialEffect
rawDiagnosticsAvailable
```

For the reproduced incompatibility, the normalized values are:

```text
failureCode = unix_socket_bind_denied
capability = local-ipc
operation = listen|bind
osCode = EPERM
syscall = listen|bind
resourceClass = af-unix-socket
locationClass = system-temp
runnerClass = codex
originLayer = native-standard
permissionPosture = standard
evidenceSource = direct|fixed-probe
```

`adapterTrace` is a closed, ordered, duplicate-free list of at most eight safe
adapter-class identifiers. An outer adapter may append its class but cannot
replace a more specific inner cause. Process spawn, command exit, semantic
probe denial, malformed output, timeout, truncation, cleanup, and transport
failure retain distinct failure codes.

Raw messages, absolute paths, usernames, hostnames, environment values,
configuration bytes, profile contents, process identifiers, command payloads,
and stack traces never enter the projection, model-visible diagnostics,
repository evidence, or portable receipts. `rawDiagnosticsAvailable` is only a
boolean; bounded raw stderr may remain in Codex's existing local diagnostics
but is never parsed for routing.

The controller appends sanitized lifecycle events for original failure, probe
start/result, classification, remediation decision, profile validation,
activation, and retirement to:

```text
<effective CODEX_HOME>/log/pipeline-ipc/<session-digest>.jsonl
```

The path is reported only as the symbolic location class above. The directory
and files use owner-private POSIX mode or native-Windows owner/DACL assurance.
One log is bounded to 256 events and 1 MiB; oldest completed session logs are
retained for at most seven days and removed only by the exact Pipeline-owned
retention routine. A full/corrupt/unwritable log returns a typed
`diagnostic_log_unavailable` event to the current result but never changes the
failure classification or activates/deactivates a profile. The router consumes
the in-memory typed projection, not JSONL readback.

Portable candidate evidence may retain only the sanitized probe projection,
event count, schema/probe versions, and SHA-256 of the bounded local log; it
cannot retain the local log itself.

Only a deterministic read-only operation with
`partialEffect: none-observed-and-proven` may receive one policy-declared
automatic retry. No profile apply, activation, writer, or ambiguous child
failure is automatically retried.

### 7.4 Profile transaction

The profile name is `pipeline-wsl-ipc-compat` unless current Codex validation
rejects it, in which case a revised neutral name requires a spec update.

The transaction operates only on the operator-local Codex configuration under
the exact resolved `CODEX_HOME`:

1. `plan-profile` reads and validates current config/profile state;
2. preview shows the exact owned-key addition, preimage digest, postimage
   digest, dangerous-key warning, and unchanged-key proof;
3. apply requires exact plan digest and explicit confirmation;
4. apply preserves unrelated bytes/keys and refuses ambiguous or unsupported
   configuration;
5. atomic write/readback validates Codex's own strict configuration parser;
6. profile definition is installed but not selected as
   `default_permissions`; and
7. successful readback publishes an operator-approval receipt bound to the
   profile name, exact config pre/postimage digests, profile digest, dangerous
   key set, approval actor, and approval time; and
8. failure restores the exact preimage or returns typed recovery state.

The custom profile reproduces the standard workspace filesystem permissions
using supported permission-profile primitives and adds only Unix-socket
compatibility. It defines no allowed external domain, non-loopback listener,
upstream proxy, SOCKS widening, credential path, or additional workspace root.

The currently documented broad fallback key
`dangerously_allow_all_unix_sockets = true` is permitted only when:

- the fixed probe confirms the incompatibility;
- no narrower supported Unix-socket rule can satisfy the fixed bind probe;
- the preview names the broad local-daemon exposure risk;
- the operator explicitly confirms the exact digest; and
- the profile remains session-selected rather than default.

This key permits the sandboxed command to reach local Unix-socket daemons that
the standard allowlist would block. It does not by itself allow external
network domains, but the local-daemon exposure is material and must appear in
the preview, approval receipt, PRD risk, and session activation readback.

### 7.5 Session activation

The model and invoked command cannot select the compatibility profile.
Activation is performed only by the model-free compatibility controller after
the verified trigger. It is bound to:

- current Codex executable/config/probe digests;
- exact triggering native failure receipt;
- installed profile digest and unchanged operator-approval receipt;
- exact project/session identity;
- one of the eligible operation classes from section 7.1; and
- successful fallback validation probe.

If the profile or config has no matching approval receipt, the controller
returns `approval-required`; it does not activate. The operator may then run
the section 7.4 preview/approve/apply/readback transaction. That explicit
approval both installs the dormant profile and authorizes automatic
current-session activation after this exact failure class. A later exact
confirmed failure may activate the unchanged approved profile without a second
prompt.

Once active, the controller selects the named profile for all later eligible
operation classes in that session. It does not rewrite global default
configuration and cannot affect a later session. Unknown or ineligible classes
remain on their independently selected route and cannot fall back.

The originally failed operation is retried automatically only if its operation
contract proves all of:

- read-only;
- deterministic;
- no partial effect observed and proven; and
- one retry maximum under the now-validated profile.

Otherwise the activation applies to the next eligible operation and the
original failure remains an honest non-success.

The ineligible duty classes in section 7.1 always retain their independently
selected narrow profiles. A read-only command inside an eligible general
workspace class is not one of those duties; it may qualify for the single safe
retry above.

Every later session resets routing to native standard. If native execution
succeeds after a Codex, config, host, or probe-version change, there is no
matching trigger and activation is not offered. The installed dormant profile
may remain until an explicit separate removal operation, but it has no active
effect. A deliberate diagnostic may report `not-required`; ordinary successful
operation need not run the verifier merely to produce that state.

### 7.6 Reproduced design baseline

The 2026-07-27 model-free probe on the exact 0.4.6 base observed:

```text
tempFile = success
operation = listen
resourceClass = af-unix-socket
socketStatus = denied
osCode = EPERM
syscall = listen
```

This proves that the observed standard-sandbox failure is local IPC/AF_UNIX,
not a general temporary-file denial. The operator separately confirmed that
the reviewed compatibility profile makes the same script pass. That
confirmation is valid design input but not 0.4.7 release evidence: the
implemented fixed payload must reproduce the standard-profile denial and the
compatible-profile success on the same installed candidate and bind both
structured results to its commit/tree.

The upstream issue calls the failing facility an IPC pipe and shows Node's
direct `listen EPERM` / `createIpcServer` path. Neither that prose nor its
stderr spelling is runtime activation authority.

### 7.7 WSL tests

Tests cover:

- first eligible operation always uses native standard;
- native operation success causes no verifier call and no profile selection;
- direct `unix_socket_bind_denied` and structurally plausible local-IPC
  `sandbox_permission_denied_unknown` each trigger exactly one verifier;
- temp success plus reproduced AF_UNIX `EPERM`;
- filesystem or unrelated-phase `EPERM` causes no verifier or fallback;
- temp failure;
- unknown AF_UNIX error;
- stderr text that disagrees with structured result;
- preservation of the inner IPC cause through every supported adapter class;
- exact sanitized JSONL event sequence, owner-private assurance, 256-event /
  1-MiB bounds, seven-day retention, full/corrupt/unwritable-log behavior, and
  proof that log contents never control activation;
- timeout, no child receipt, wrong identity, canary drift, and cleanup failure;
- preview/apply/readback, digest drift, unsupported config, rollback, repeated
  plan/apply, and absence of default activation;
- exact dangerous-key warning and consent;
- activation for later operations in the same session, guarded retry of the
  original read-only/no-partial-effect operation, no retry for ambiguous or
  effectful operations, next-session native reset, Codex/config/probe drift,
  built-in recovery without verifier execution, and `not-required`; and
- narrow-duty non-inheritance.

Native WSL evidence is required. Synthetic Linux tests alone cannot establish
the WSL acceptance cell. The native evidence contains the paired fixed-probe
results under the built-in standard posture and approved compatibility
profile, using the same candidate, Codex/config digest, probe version, and
workspace class.

## 8. H5 — Advisor timeout policy

Change `HOST_ADVISOR_POLICY` to:

```text
maxAttempts = 2
primary.timeoutMs = 180000
fallback.timeoutMs = 90000
```

All other primary/fallback fields remain byte-for-byte semantically
equivalent:

- primary `consult-advisor`, `gpt-5.6-sol`, `max`;
- fallback `consult-advisor-fast`, `gpt-5.6-terra`, `high`,
  `forkTurns:none`;
- one monotonic deadline per attempt;
- interrupt at the deadline;
- workspace digest before/between/after;
- no third attempt; and
- continue as `advisory-unavailable` after exhaustion.

Update:

- `codex-host-advisor-route.mjs`;
- its focused test;
- pipeline-start skill wording; and
- pipeline-start contract tests.

Search-based acceptance proves no maintained bootstrap instruction or test
still asserts the old 60/45-second policy.

## 9. Integration and collision control

### 9.1 Bounded implementation slices

Each slice is one serial dispatch with exclusive ownership for its duration.
No slice may exceed its listed paths or acceptance set; a scope burst stops the
dispatch for reslicing. Same-file slices never run in parallel. The next slice
starts only after the prior slice's focused tests and diff review are green.

| Slice | Exclusive production ownership | Required acceptance before handoff |
| --- | --- | --- |
| `047-LCY` | dedicated continuity adoption transition in the continuity library and State writer, matching tests, and hash-bound 0.4.6 close evidence | AC-047-27; exact planner/apply/close path and every preimage/drift/replay/durability negative green; old feature closed and 0.4.7 authority read back before any later slice |
| `047-BKG` | backlog missing-event planner/writer plus ledger/STATUS/index projection surfaces | AC-047-01–02; canonical checker and transaction recovery green |
| `047-GRD` | hook-local command grammar, lifecycle guard, outer pretool guard tests | AC-047-09–12; exact POSIX/Windows pipeline and hostile syntax matrix green |
| `047-WIN` | Codex restart executable resolver and shared private restart-state adapter | AC-047-13–15; native-Windows direct executable/private-state fixtures plus POSIX regression green |
| `047-V4P` | V4 source/manifest planners and CLI result schemas in onboarding library/script | AC-047-03–05; every closed recovery category and deterministic zero-write plan green |
| `047-V4A` | manifest apply/race handling, exact recovery guard entries, pipeline-start recovery wording, onboarding threat model | AC-047-06–08; drift/race/quarantine, outer guard, and process readback fixtures green |
| `047-IPC` | closed sandbox-failure projection, nested propagation, bounded machine-local diagnostic log, and model-free temp/socket verifier | AC-047-16–18; real/false trigger, exact IPC cause, adapter trace, sanitization/log bounds, canary, cleanup, timeout, and no-model tests green |
| `047-PRO` | dormant profile transaction, approval receipt, session controller, duty routing | AC-047-19–23; install/readback, paired standard/compatible probe, exact activation, safe retry, next-session reset, fix-retirement, and narrow-duty isolation green |
| `047-ADV` | Advisor route policy and pipeline-start timeout wording/tests | AC-047-24; exact 180/90-second policy and unchanged route semantics green |
| `047-INT` | Verify registration, hotfix result/evidence, release/version surfaces, downstream collision manifest | AC-047-25–26; all candidate gates in section 10 bind one exact commit/tree |

`047-LCY` lands and performs the sanctioned lifecycle transition before every
other slice. `047-GRD` and `047-WIN` land before `047-V4P/V4A`, so #63 consumes the shared
#73 command/runtime primitives instead of adding a second parser. `047-IPC`
lands before `047-PRO`. #70 and Advisor budgets remain independently
reviewable. File-level context/ownership for each dispatch is derived from
section 2.1 and narrowed to only the files that slice actually changes.

### 9.2 Nova rebase

After 0.4.7 reaches the approved integration commit:

1. Nova rebases from the exact 0.4.7 integration commit;
2. it identifies the old B4R implementation derived from `7de0ec8`,
   `bef69f7`, `17da0b2`, `8701961`, and `ddd0d6a`;
3. it drops duplicate behavior already supplied by 0.4.7;
4. it manually reconciles legitimate Nova changes in overlapping files;
5. it keeps a short historical transfer note for #63; and
6. it reruns Nova's complete candidate gates.

Expected collision paths include:

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`;
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`;
- `plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs`;
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs`;
- `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`;
- `plugins/pipeline-core/scripts/project-onboarding-v3.mjs`;
- `plugins/pipeline-core/scripts/project-onboarding-e2e.test.mjs`;
- `plugins/pipeline-core/skills/pipeline-start/SKILL.md`; and
- `docs/codex-onboarding-threat-model.md`.

No automated conflict resolution may choose Nova or hotfix wholesale for those
paths.

### 9.3 Other Sprint rebases

For each of the three Sprint branches rebasing onto 0.4.7, produce a
machine-generated changed-path intersection and a human disposition for every
overlap. A successful textual rebase is not acceptance; each Sprint reruns its
own focused and full gates against its new exact candidate.

## 10. Verification gates

### 10.1 Focused gates

Required focused suites:

- legacy continuity adoption pure-transition, State writer plan/apply, normal
  close-feature, and PO-authority activation;
- backlog state/transaction tests and canonical checker;
- lifecycle guard and outer Codex pretool guard;
- project onboarding unit and process E2E;
- Codex onboarding runtime and Windows private-state assurance;
- WSL IPC probe/profile/session controller;
- host Advisor route; and
- pipeline-start contract tests.

Every new focused suite is registered in the single Verify gate.

### 10.2 Platform gates

Required platform evidence:

- Linux regression lane for guard, V4 recovery, runtime, and Full Verify;
- native WSL lane reproducing standard temp success/AF_UNIX failure and
  validated session fallback;
- native Windows non-admin lane using a packaged/installed 0.4.7 candidate,
  direct `codex.exe`, fixed PowerShell skill read, restart persistence,
  restart/readback, and owner-private state; and
- a second standard-compatible lane proving the WSL fallback is not required
  when the built-in profile works.

Issue #72 and native Apple Silicon are not platform gates for this release.

### 10.3 Candidate gates

The exact candidate commit and tree must pass:

1. all focused suites;
2. Full Verify;
3. blocking Security;
4. fresh independent Critic review over the hotfix diff and this design;
5. packaged Claude and Codex plugin validation;
6. installed-plugin readback;
7. native platform evidence above;
8. version-surface and changelog consistency; and
9. clean repository/readback after candidate evidence is recorded.

Any rerun after a candidate byte changes binds a new commit/tree and supersedes
the earlier evidence. Evidence from PR #64 or any Nova candidate is inadmissible.

## 11. Release evidence

Create hotfix-owned result/evidence under this design directory. It records:

- exact base, candidate commit, and candidate tree;
- exact legacy continuity preimage, adoption-plan/apply readback, 0.4.6 close
  evidence, and 0.4.7 plan-activation readback;
- exact reference commits used for #63;
- included Issue mapping (#63, #70, #71, #73);
- explicit #72 and PR #64 exclusion;
- focused/platform/Verify/Security/Critic commands and results;
- installed plugin versions and readback;
- version and release surface digests;
- known residual risks; and
- downstream Sprint collision/rebase manifest.

Issue comments, status changes, PR operations, release publication, tag, and
merge remain separately authorized external actions.
