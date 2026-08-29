---
schema: pipeline.backlog-item.v1
id: pipeline.po-facing-commands-are-not-uniformly-rendered-break-safe
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
source: "Codex/WSL greenfield run, 2026-08-28 (docs/pipeline-session-analysis-2026-08-28.md), plus the PO's own observation that this runner needed three sessions and the most detours."
done_when: contains plugins/pipeline-core/lib/project-onboarding-v3.mjs copy-safe-command.mjs
---

# Commands handed to the PO for external execution are not uniformly rendered break-safe, and every runner lost turns to it

## What happened

The Codex run lists five separate transfer failures in security-critical steps —
none of them a user mistake:

- a node binary was itself executed with `node` as if it were a JavaScript file;
- a script path was split by a line break into `guard-` and `human-override.mjs`;
- a hash was passed with no space after `--request-sha256`;
- a key path arrived as `gent-pipeline-key` instead of `agent-pipeline-key`;
- a branch placeholder was read as the literal word.

Each cost a retry, and several cost a *new signature intent* — the expensive
kind of loop, because a fresh preimage invalidates the previous one.

## The diagnosis

The Pipeline already knows how to do this correctly. `guard-lifecycle-ready.mjs`
emits a bounded copy-safe rendering (`max 72 columns`, posix and powershell
variants, assembled through `CMD=`/`$CMD +=` fragments) for exactly this reason,
and the PO confirms that specific rendering is the one that "halbwegs
funktioniert". The defect is that it is **not applied uniformly**: other
PO-facing command emitters print a single long line and rely on the terminal not
to wrap it.

The rule this repository already states for a different case applies here in
full: a pre-rendered command must be relayed verbatim from the tool result, never
retyped. What is missing is that not every emitter produces such a rendering in
the first place.

## Direction

One shared renderer, used by every path that hands a human a command:

1. A single library function that takes an argv array and returns the bounded
   posix/powershell/cmd renderings — the emitters stop formatting their own.
2. **Never hand-assemble a PO command from prose.** Where a runner constructs
   one, it must come from that renderer's output.
3. Prefer handing over a *file* (a checksummed `.sh`/`.ps1`) over a long chat
   line wherever the ceremony allows it, as the Codex report recommends — a
   digest the PO can verify beats a line they must copy correctly.
4. A conformance test that asserts every PO-facing emitter's output is bounded
   and round-trips through a real shell to the exact intended argv. The
   `GF-105` test in `po-human-approval.test.mjs` already does this for one
   command; the coverage is what needs widening, not the technique.

## Acceptance criteria

- Every PO-facing command emitter routes through the shared renderer.
- A test proves each rendering round-trips to the intended argv, including
  values with spaces and non-ASCII characters.
- No emitter prints an unbounded single-line command.
