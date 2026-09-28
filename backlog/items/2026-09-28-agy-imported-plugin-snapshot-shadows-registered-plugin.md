---
schema: pipeline.backlog-item.v1
id: pipeline.agy-imported-plugin-snapshot-shadows-registered-plugin
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "PO Claude handover and independent read-only verification, 2026-09-28; backlog/evidence/agy-imported-snapshot-20260928-readback.json and -verification.md. Physical stale copy/current registry and one stale-version fixture lock confirmed; exact load precedence remains pending."
sprint: alfred
done_when: manual
---

# Imported Agy snapshot conflicts with the registered Pipeline source

This active item supersedes [pipeline.agy-greenfield-run-used-stale-plugin](2026-09-27-agy-greenfield-run-used-stale-plugin.md), per PO decision on 2026-09-28. The predecessor is closed for deduplication, not fixed. Its historical evidence and requirement for a version-correct 0.7 run remain part of this item.

## Description and independent verification

Read-only physical readback confirms a managed/imported Pipeline copy at
`~/.gemini/config/plugins/agent-pipeline-core` with version
`0.6.2+antigravity.20260913103423.c1e799c`. The import manifest records
source `antigravity`, importedAt `2026-09-15T20:18:50Z`, and components
`skills`, `agents`, `hooks`. At the same time the user-global path registry
names `~/agent-pipeline-local-marketplace/plugins/pipeline-core`, whose three
runner manifests carry `0.7.0+…20260927174722.15c963ef`.

The current installer updates the selected registry, optional settings and
attestation; it has no imported-copy lifecycle or discovery. A marketplace-only
refresh likewise leaves the separate managed copy untouched. Thus duplicate/stale
topology is confirmed, and registry-only repair cannot retire that copy. Actual
CLI precedence and which sources a new session loads still require the spike.

| Independently read fact | Result |
| --- | --- |
| Global registry | One Pipeline entry, current marketplace directory |
| Managed/imported copy | 0.6.2; three runner manifests physically present |
| Marketplace manifests | 0.7.0; mtime 2026-09-27T17:47:22.624Z |
| Global hook wiring | Two absolute marketplace commands; authoring origin unverified |
| Snapshot hooks.json | Relative Antigravity start/pretool/stop/slicing commands |
| Fixture .agents/plugins.json | Absent |
| Fixture session-47742919-… lock | locked=true, version=0.6.2; current mtime 2026-09-27T19:27:27.928Z |
| Fixture session-dummy lock | version=0.7.0, missing locked; current mtime 2026-09-27T18:43:03.346Z |

Evidence: [sanitized physical readback](../evidence/agy-imported-snapshot-20260928-readback.json)
and [verification scope](../evidence/agy-imported-snapshot-20260928-verification.md).
Only Pipeline metadata, file hashes and lock version/shape were projected; no
full Claude/Codex settings, credentials or transcripts were read or published.

## What the facts do and do not establish

The start hint writes its own plugin-root manifest version into the lock. The
0.6.2 lock is therefore strong evidence consistent with a stale-root hook write.
The lock is mutable metadata, not an executed-path attestation. Its mtime/body do
not prove the exact writer, manual origin of the dummy lock, CLI precedence,
daemon state, hook overwrite order, effective pretool guard, or every historical
session since import. Those assertions in the original handover are not accepted
as proven. Snapshot shadowing remains the leading explanation to test.

The historical greenfield report describes name-only approval under signature
mode, but lacks per-command provenance. Preserve it as a regression observation;
it cannot prove a 0.7 bypass or count as 0.7 acceptance. Before acceptance, record
the actual loaded root, version, content identity and policy, then demonstrate
unsigned refusal and signed approval on the intended version with receipt/state
readback. A stale managed copy is a governance-version risk because old code may
enforce old rules; direct causation of the reported approval is not established.

The three observed configuration locations are user-global. The installer itself
describes global registration as applying to all projects. Actual discovery or
hook firing in ~/src or every other directory was not measured here. Loading and
governing are separate: the current start hint intentionally avoids bootstrap
locks in ungoverned/uninitialized directories. The PO's requested repo-local
scope should be validated explicitly rather than inferred from registry names.

### Cross-runner follow-up: unverified handover claims

Claude/Codex user-global enablement, an archived Claude debug hook, and each
runner's supported project-only enablement remain unverified in this item. No
global settings were independently inspected. Retain these as scoped follow-up
questions; do not treat them as confirmed activation in every directory or an
authorized global cleanup.

### CLI behaviour: handover references, pending reproduction

The handover cites CLI 1.2.12 changelog claims: managed global installation
(1.0.2), whole-directory import (1.0.14), config enablement (1.1.11), configured
path precedence (1.1.21), exact install/uninstall replacement (1.1.28), version
pruning (1.2.7), and direct-child directory loading (1.2.10). It also reports
plugin list/help and validate success. None was independently rerun here. In
particular, the observed duplicate topology does not by itself contradict the
documented precedence. Verify these behaviours and command syntax in S1–S6 before
fixing the installer topology or running remediation.

## Affected artifact

- `plugins/pipeline-core/install-agy.mjs` (+ `install-agy.test.mjs`): knows
  the path registry, optional settings and attestation. It is blind to the managed snapshot, the import
  manifest, and hand-wired global `hooks.json` entries. Its "Global" option
  also creates a global activation.
- `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`:
  - `resolveAntigravityRegistryInstalledRoot` (in
    `scripts/installed-plugin-attestation-host.mjs`) only asks whether the
    loaded root has exactly one registry entry. For a loaded root differing from the
    registry entry it returns null; it does not discover managed copies or diagnose
    duplicate-source precedence. The current installer cannot retire an imported
    copy. The exact proposed recovery/action should be verified before replacement.
  - `observeAntigravityHardEnforcement` / `lockVersionMatches` silently
    *skip* a lock whose version differs from the running build. They then
    report `antigravity-hard-enforcement-not-observed` with a warning about
    daemon/node resolution. A differing recorded build goes undiagnosed; the scan does not prove
    the exact runtime cause. Its fail-closed freshness refusal must be preserved.
- `SETUP.md` §"Antigravity installation details for step 0", `GEMINI.md`,
  `docs/runner-support.md`: they describe `plugins.json` as the binding and
  never mention agy's managed plugin directory, the import, or how to
  retire the snapshot.
- The local developer refresh (bare `rsync` into the marketplace): the
  refresh is incomplete for Antigravity by construction.

## Proposal — how the fix must be built

### 0. Spike first (mandatory, before any design is fixed)

The fix depends on agy internals we have not verified. Run each question in a
disposable isolated account/container with no PO credentials or real config,
or a documented CLI configuration-root override. Do not repurpose HOME or run
these mutation spikes against the PO's real `~/.gemini`:

- **S1** Does `agy plugin install <absolute local dir>` accept a local path?
  Where does it copy to? Is the managed directory keyed by folder name or by
  manifest `name` (`agent-pipeline-core`)? Does `agy plugin list` show it
  afterwards?
- **S2** Precedence: when the same plugin name exists both as a managed copy
  and as a `plugins.json` path entry (global, and separately workspace
  `.agents/plugins.json`), which one does a new session load? Measure it with
  the requires-bootstrap lock version, along with independent loaded-source observations; a mutable lock alone is not
  executed-path proof.
  `agy plugin list` is not proof.
- **S3** After CLI 1.2.10, does a `plugins.json` entry that points at a
  plugin *root* load that plugin, or does agy scan its children as a
  container? If it scans children, our registry entry is inert, which would
  fully explain why the snapshot won. The installer's registry format would
  then have to change.
- **S4** What does `agy plugin import [source]` do, and what created the
  `source: "antigravity"` import (the onboarding import checkbox, changelog
  1.1.10)? Can a later onboarding or import re-create a snapshot after we
  remove it?
- **S5** Is there a workspace-scoped managed install, or is managed install
  always global?
- **S6** Does a running session pick up changes (for example `/skills reload`,
  1.2.4), or is a full agy restart required for skills, agents, and hooks?

Record the results under `backlog/evidence/` and pick topology option A or B
(§1) from them.

### 1. One load topology per scope (PO decision after the spike)

Two sources for the same plugin name are the root defect class. Whichever
option is chosen, **exactly one** agy-visible source of `agent-pipeline-core`
may exist per effective scope:

- **Option B (recommended, matches the PO's expectation and SETUP.md):**
  workspace-local only. `.agents/plugins.json` in each consumer project, and
  **no** global managed copy, no global `plugins.json` entry, and no global
  `hooks.json` Pipeline wiring. `~/src` and other folders then see no
  Pipeline at all. This depends on S2/S3 proving that a workspace path entry
  actually loads.
- **Option A:** agy-managed install. `agy plugin install <approved source dir>`
  keeps one global managed copy, updated only through `agy plugin install`
  (exact replacement, 1.1.28), and there is no `plugins.json` entry. This is
  simpler for agy, but it is global by construction, which contradicts the
  PO's stated expectation.

Keep the installer's existing workspace-local default. Decide whether to retire
the optional "2) Global" choice or retain it with stronger explicit topology
and scope warnings; it is already labelled as applying to all local projects.

### 2. Detection: one shared, read-only topology observer

Add a pure observer, for example `lib/antigravity-plugin-topology.mjs`, that
returns a closed schema `pipeline.antigravity-plugin-topology.v1`. It must
enumerate **every** place agy can obtain Pipeline code from:

1. managed copies: every `~/.gemini/config/plugins/*/plugin.json` whose
   `name` is `agent-pipeline-core`, plus the matching
   `import_manifest.json` entry (`importedAt`, `source`, `components`);
2. global `~/.gemini/config/plugins.json` entries;
3. workspace `<root>/.agents/plugins.json` entries;
4. any further locations S1–S5 reveal (for example workspace-managed plugin dirs);
5. hook wiring *outside* the plugin's own `hooks.json` that references
   `pipeline-core/hooks/*.mjs` (global `~/.gemini/config/hooks.json`,
   workspace `.agents/hooks.json`). This covers the hand-wired case found here.

For each source, report `{kind, path, manifestVersion, contentDigest}`.
Compare the content digest against the approved source tree. Reuse the
runner-neutral identity observer that already exists for Claude and Codex
copies, because a version stamp alone can lie. Verdicts:
`single-current` · `stale-managed-copy` · `duplicate-sources` ·
`foreign-hook-wiring` · `no-source` · `unverifiable` (fail-closed on any read
or parse fault; never infer).

Use the observer in **three** places. The reason: a stale snapshot runs *old*
code, so a check that lives only in the loaded plugin can never catch its own
staleness.

- **`install-agy.mjs`** runs from the fresh source checkout, so it is always
  new code. This is the primary detection point.
- **`pipeline-start-preflight.mjs`** (Antigravity runner). This guards the
  future, once a build with the check is loaded:
  - Any verdict other than `single-current` gives status
    `plugin-refresh-required` (an existing status) with the new reason codes
    `IPA-AGY-STALE-MANAGED-COPY`, `IPA-AGY-DUPLICATE-SOURCE`, or
    `IPA-AGY-FOREIGN-HOOK-WIRING`. This replaces the non-converging "rerun the
    installer" text for these cases.
  - Stop skipping mismatched locks silently in
    `observeAntigravityHardEnforcement`. A fresh lock whose version differs
    from the running build yields the distinct reason
    `antigravity-lock-version-mismatch`, naming both versions. That lock is
    runtime proof that a *different* build's hook is executing, exactly as in
    this incident.
- **The developer refresh path** (§4). It runs from the source checkout, so
  it is new code.

Optional, advisory only: the Claude/Codex `staleness-check` hook may report
Antigravity topology drift on the same machine, since it runs fresh code
outside agy.

### 3. Remediation: automatic, but only through agy's own lifecycle and only at the host boundary

Principles:
- **Use the owning tool's lifecycle commands, never raw deletion.** The
  managed directory, `import_manifest.json`, and `config.json` enablement are
  agy-owned state. Use `agy plugin uninstall agent-pipeline-core` and, for
  option A, `agy plugin install <source>`. Do **not** `rm -rf` the snapshot and
  do not hand-edit `import_manifest.json` or `config.json`. Manual deletion
  leaves stale enablement and import entries, and changelog 1.1.28 shows that
  uninstall exists precisely to clean those. If S1/S4 show that the CLI
  cannot perform a needed step, stop with a typed operator instruction rather
  than editing agy state by hand.
- **Never mutate from inside an agy session or a hook.** The preflight and
  the hooks run inside the session whose plugin is being replaced. A
  self-modifying guard is authority-bearing (GL-09), and the running session
  keeps its already-loaded skills anyway (see S6). So the preflight **only
  detects** and emits a typed host action. Mirror the existing Codex pattern
  `pipeline.installed-plugin-attestation-setup-action.v1` with
  `executionBoundary: host`, `mutation: true`, the exact argv (for example
  `node <source>/plugins/pipeline-core/install-agy.mjs --refresh --scope workspace`),
  and the expected result schema. The PO or operator runs it in a host
  terminal, then restarts agy.
- **The installer remediates, with preview, idempotently, and with readback.** Sequence:
  1. Observe the topology (§2) and `agy plugin validate <source>`. Refuse on
     `unverifiable`.
  2. Print the exact plan: the source that stays, what gets uninstalled or
     unregistered, and which non-Pipeline entries are preserved. Require
     confirmation. A `--yes` flag skips the prompt only for the developer
     refresh.
  3. Bind the new source first (workspace `plugins.json` for B, or
     `agy plugin install` for A), then remove the extra sources:
     `agy plugin uninstall` for managed copies, the existing atomic registry
     writer for `plugins.json` entries, and a new atomic writer (same
     temp-file + fsync + rename pattern as `updatePluginRegistry`) that
     removes **only** Pipeline hook entries from global and workspace
     `hooks.json` and preserves all others. Keep the previous approved source
     directory until readback succeeds, as SETUP.md already requires.
  4. Read back again: the verdict must be `single-current` with a digest
     equal to the source. On any failure, report the exact partial state and
     stop. Do not escalate to further deletions.
  5. Print "fully restart agy" and the post-restart proof step: open a new
     session, then check that the newest `requires-bootstrap.lock` version
     equals the source version (or check that the preflight is `ready`).
- **Idempotence:** running the installer twice against a `single-current`
  topology is a no-op. This matches the existing early return in
  `updatePluginRegistry`.

### 4. Replace the bare rsync developer refresh

Ship `scripts/antigravity-refresh-local.mjs`, or `install-agy.mjs --refresh`.
It performs the marketplace sync **and** the §3 remediation plus readback in
one step, so "I synced the plugin" and "agy loads the plugin" can no longer
diverge. Document it in SETUP.md and in the Codex/Claude local-marketplace
refresh notes as the only supported Antigravity refresh.

### 5. Tests (fake `agy` executable + injected fixture configuration root, no real agy)

Cover at least these cases. For each, assert the observer verdict, the
preflight status/reason/nextAction argv, the installer plan and the order of
`agy` calls, and the readback-failure stop:
- this incident: global `plugins.json` → current marketplace + stale managed
  copy + hand-wired global `hooks.json`;
- stale managed copy only;
- a correct single source (no-op, idempotent);
- workspace-local and global sources for the same plugin at once;
- a malformed or unreadable `import_manifest.json` / `hooks.json` → `unverifiable`, no mutation;
- a fake `agy plugin uninstall` failure → the partial state is reported and nothing else is deleted;
- a lock-version mismatch → the distinct preflight reason instead of `hard-enforcement-not-observed`.

### 6. Docs

SETUP.md step 0, GEMINI.md, `docs/runner-support.md`, and
`skills/pipeline-start/references/local-plugin-attestation.md`: explain agy's
managed plugin directory and import manifest, the single-source rule, the
chosen scope (A or B), the refresh command, and the restart-plus-lock proof.
State explicitly that `agy plugin list` and the `plugins.json` contents are
not proof of what is loaded (consistent with the Alfred spec/PRD wording).

### Not in scope / explicitly not done here

The PO's machine was left unchanged (read-only diagnosis). The manual cleanup
of the current machine should follow the spike results, not precede them.
The obvious candidate is `agy plugin uninstall agent-pipeline-core`, then
removing the two Pipeline entries from `~/.gemini/config/hooks.json`, then
binding per option A/B, restarting agy, and checking the lock. It is still
unverified, especially S2/S3.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted for Alfred triage; active successor of the closed stale-run item, per PO on 2026-09-28.
- **Rationale:** Physical duplicate/stale topology and installer/diagnostic blind spots are confirmed. Actual precedence, activation scope and supported remediation commands remain spike requirements, not confirmed outcomes. No installation fix or version-correct acceptance run has been completed.
- **Assignment (if accepted):** First bounded S1–S6 validation, then source-backed topology diagnostics and convergent host-owned refresh, preserving unrelated configuration; version-correct acceptance evidence remains required.
- **Date:** 2026-09-28
