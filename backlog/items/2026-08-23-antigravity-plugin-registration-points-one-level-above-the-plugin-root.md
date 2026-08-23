---
schema: pipeline.backlog-item.v1
id: pipeline.antigravity-plugin-registration-points-one-level-above-the-plugin-root
type: defect
owner: pipeline
status: open
created: 2026-08-23
source: "Delta Critic review D7 (specs/sprint-agy-runner/evidence/2026-08-23-delta-critic-review-agy-runner.md), escalated by post-review verification against the object database and working tree"
due: 2026-08-30
---

# `.agents/plugins.json` registers the plugin container, not the plugin root, so the Antigravity enforcement layer very likely never loads

## Description

`.agents/plugins.json` carries `entries[0].path = "plugins"`. The installer that
writes this file defines the field as a **plugin root**: `install-agy.mjs:28`
resolves `corePluginPath` by locating the directory containing `plugin.json`,
and `:72` writes exactly that value. In this repository
`plugins/pipeline-core/plugin.json` exists and `plugins/plugin.json` does not,
so the tracked value is one path component too high.

The history shows the same defect twice and one empirical symptom:

- `bd112cc0` created the file with `"path": "plugins"` while its own commit
  message states it registers `plugins/pipeline-core`.
- `48591844` — *"fix: bypass plugins.json and write directly to hooks.json for
  reliable loading"* — deleted the file outright and wrote `.agents/hooks.json`
  instead. This is direct evidence that the entry did not load.
- `ffa55f78` migrated back to `plugins.json`.
- `5925e7f2` replaced a machine-absolute `/home/…/plugins/pipeline-core`, which
  pointed at the real plugin root, with `"plugins"`, describing it as restoring
  the repository-relative entry. The repository-relative equivalent of that
  absolute value is `plugins/pipeline-core`; the last component was dropped. The
  absolute path was the only value in this file's history that ever pointed at a
  plugin root.

No repository code resolves the path: `plugins.json` appears only in the two
`install-agy.mjs` copies, which write it and never read it at runtime.
Resolution happens inside the Antigravity runner, and nothing in this repository
establishes that it accepts a relative path at all, or what it resolves one
against.

## Why this matters

If the entry does not resolve, the PreToolUse enforcement layer does not load.
That is a fail-open of the entire Antigravity guard layer — not a defect inside
a guard, but the absence of all of them — while every artifact describing the
system presents the layer as hard technical enforcement
(`prd_agy-runner.md` §2 invariant 1).

It is a live candidate root cause for two things previously left open:

- The push escape the PO observed and confirmed under Antigravity, where the
  guard did not prevent a push.
- F10 of the first Critic review — how protected test paths were written inside
  the reviewed range. That review recorded the mechanism as **unexplained**,
  having correctly rejected the obvious hypothesis: both the write lane
  (`guard-testpath.mjs`) and the shell lane (`guard-lifecycle-ready.mjs`) are
  wired. A layer that never loads explains the observation without either lane
  being mis-wired.

## Why no fix was applied

The obvious edit (`plugins` → `plugins/pipeline-core`) is not verifiable from a
Claude Code session: no Antigravity runner is available to test whether the
runner resolves relative paths, or against which base.

To be precise about the reason, because the loose version of it would mislead
the decision: the current state is not *unknown*, it is known-inert — the layer
is off, and `48591844` is the empirical evidence. A change that is at worst
also inert therefore cannot be worse than what is there now, and "trading
known-bad for unknown" would be the wrong way to describe it.

The actual reason not to apply it unattended is different: an unconfirmed fix
to a security control reads as a fixed control. The commit would say the
registration was corrected, the layer would appear restored in every artifact
describing it, and nobody would have observed a single guard fire. That is the
same failure shape as F5 of the first review, where a control existed in the
source, was believed to work, and had never executed. Repeating it here — on
the registration that decides whether ANY of those guards load — is the outcome
worth avoiding, not the edit itself.

The three candidate routes trade off against each other and the choice is the
PO's:

1. **Relative plugin root** (`plugins/pipeline-core`) — policy-clean under
   CLAUDE.md, semantically correct per the installer, but relative-path support
   is unproven.
2. **Machine-absolute path** — the only value ever demonstrated to work, but it
   violates CLAUDE.md's machine-specific-absolute-path rule and does not resolve
   from a checkout at any other location. This repository runs on two machines.
3. **Write `.agents/hooks.json` directly** — the route history already fell back
   to under `48591844`, bypassing the registration indirection entirely.

## Acceptance

- The resolution semantics of `entries[].path` are established empirically
  against a running Antigravity runner, not inferred.
- `.agents/plugins.json` (or its chosen replacement) demonstrably loads the
  guard layer, evidenced by a guard actually firing in an Antigravity session.
- The installer and the tracked file agree on what the field denotes.
- Whether this explains the observed push escape and F10 is stated explicitly,
  either way.
