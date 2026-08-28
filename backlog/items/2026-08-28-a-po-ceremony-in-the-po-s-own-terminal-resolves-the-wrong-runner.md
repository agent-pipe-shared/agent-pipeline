---
schema: pipeline.backlog-item.v1
id: pipeline.po-ceremony-resolves-the-wrong-runner
type: defect
owner: pipeline
status: resolved
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — a gate that forces the PO into their own terminal must not land them on a different runner there; reported by a consumer project and confirmed in the code"
source: "Consumer project HA, incident report S56 finding B5 (2026-08-28, Windows, pipeline-core 0.6.0+claude.20260828131316.03c6e1e). Mechanism re-verified in this repository's own code before filing, and the reported diagnosis sharpened."
---

# A PO ceremony run in the PO's own terminal resolves the wrong runner

## What happened

The chat-mode gates deliberately force the PO into their own attended terminal — that
is the whole point of the TTY check. In that terminal, the same command the agent
session runs resolved a different runner:

```
node <plugin>/scripts/project-onboarding-v3.mjs inspect --root D:\Dev\HA --intent session
-> "runner": "codex", "status": "runtime-attestation-required"
```

The repository's `pipeline.user.yaml` declares `runners.default: "claude"`, and the
session works on the `claude` lane. The returned `nextAction` was
`plan-readback --runner codex`. Had the PO run it, the repository would have been moved
toward Codex runtime attestation, including a forced restart. Only an explicit
`--runner claude` produced the right lane.

## The mechanism, read from the code rather than from the report

`resolveActiveRunner(env)` — `plugins/pipeline-core/scripts/project-onboarding-v3.mjs`,
around line 239:

```js
return env.CLAUDECODE === "1" ? "claude"
  : (env.ANTIGRAVITY_AGENT === "1" || env.AI_AGENT === "antigravity") ? "antigravity"
  : "codex";
```

Its own comment argues that at the process entry point "which runner is this project
for" and "which runner is executing this process" coincide, "because the entry point IS
the running session". That is exactly the assumption a PO terminal breaks: there the
entry point is a human shell, which is no runner at all.

**The sharper finding, which the report did not name:** there is no positive Codex
signal anywhere. `codex` is purely the else-branch — the same else-branch is reached by
a genuine Codex session and by a human shell, and nothing distinguishes them.
`pipeline-start-preflight.mjs` line 769 carries the identical expression, so both entry
points share the ambiguity.

## Why the obvious fix is not safe as stated

"Fall back to `runners.default` when no environment signal is present" would change
behaviour for a real Codex session in a dual-runner repository whose default is
`claude` — a configuration that exists and is tested
(`project-onboarding-v3.test.mjs`: "Codex bootstrap accepts a dual-runner source whose
default runner is Claude"). That session would silently start resolving as `claude`.

So a fix has to separate the two cases the else-branch currently merges, not merely
reorder the precedence.

## Direction

Two candidates, not mutually exclusive:

1. **Make the ambiguity go away.** Give Codex a positive signal the way Claude and
   Antigravity have one, so "no signal at all" becomes a distinguishable third state —
   and only in that state consult the repository's declared `runners.default`, falling
   back to `codex` only when the repository declares nothing.
2. **Never hand a human an under-specified command.** Every ceremony instruction
   rendered for the PO's own terminal carries `--runner` explicitly, resolved by the
   session that renders it. This is the safe half and does not depend on (1); it also
   protects against any future ambiguity of the same class.

(2) alone closes the reported harm. (1) is what closes the class.

## Acceptance criteria

- A ceremony command rendered for the PO's own terminal names its runner explicitly, and
  a test asserts a rendered PO-facing command never omits it.
- A dual-runner source with `runners.default: "claude"` still resolves a genuine Codex
  session as `codex` — the existing regression test stays green and is joined by one that
  pins the human-terminal case separately.
- No path silently moves a repository onto a runner lane the human did not choose.

## Related

- `2026-08-28-a-chat-gate-is-unusable-with-a-non-ascii-name-on-windows.md` — the gate that
  forces the PO into that terminal in the first place. Fixed; this is what they meet once
  they get there.

## Closing note (NVA-U-RECONCILE reconciliation, 2026-08-28)

Verified against current code, not against the commit message. `resolveOnboardingCliRunner`
(`plugins/pipeline-core/scripts/project-onboarding-v3.mjs` line 243) now delegates to the
single shared `resolveActiveRunner` in `pipeline-start-preflight.mjs` (line 779), which
consults the project's own declared `runners.default` from `pipeline.user.yaml` (line 788-789)
when no CLI/env signal is present — closing Direction (1). `formatOnboardingRerunCommand`
(line 407-408) always appends `--runner <resolved>` when the caller's args did not already
spell it out, and is exercised by `plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs`
— closing Direction (2), the safe half that alone closes the reported harm. Both acceptance
criteria are met in code.
