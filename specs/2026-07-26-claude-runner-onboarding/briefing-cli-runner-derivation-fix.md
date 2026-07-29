# Briefing — CLAUDE-RUNNER-01c: `v3-bootstrap-authority.mjs` CLI runner derivation

> Dispatch briefing for one `goldfish-deep` (effort xhigh) task. Fresh context.
> Deliver a diff + condensed evidence-backed report, or a clean stop.

## Field 0 — Dispatch metadata

- **Sub-package:** CLAUDE-RUNNER-01c (self-application finding #1). The
  standalone CLI entrypoint of `v3-bootstrap-authority.mjs` was missed when
  CLAUDE-RUNNER-01b made the library runner-aware.
- **Candidate base:** `feat/sprint-cyborg-claude` @ HEAD `c3ecb32`. Working tree
  is clean; keep it clean (one atomic commit at the end). Do NOT touch
  `.claude/pipeline-state.json` or `pipeline.user.yaml`.
- **Model / effort:** `goldfish-deep` / opus / **xhigh** — justified:
  bootstrap-authority (canon) code plus test authorship; correctness governs
  every Claude session's bootstrap-readiness diagnostic.
- **Profile:** epic, execution phase.

## Field 1 — Goal

Make the standalone CLI `main()` of
`plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs` derive and pass the
runner, so a Claude-Code project's `--root` invocation reaches `ready`/exit 0
instead of the current spurious `projection-current`/exit 1.

**Confirmed RED baseline (this repo, a `claude-code` / `runners.default:"claude"`
project) BEFORE your change:**

```
$ node plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs --root "$PWD"
{ ... "status": "projection-current", "runtimeReadback": "absent" ... }
CLI_EXIT=1
```

Root cause: `main()` (line ~344) calls
`validateV3BootstrapAuthority({ rootDir: options.root, deps })` and **omits
`runner`**, so it defaults to `"codex"` (the exported function's documented
fail-closed default, line ~224). On a Claude host that forces the Codex
native-readback path (`projectionCurrent`, line ~100), whose restart barrier is
absent → `projection-current` → CLI exit 1. The **exported
`validateV3BootstrapAuthority` and `projectionCurrent` are already correct**
(they short-circuit to `ready`/`runtimeReadback:"not-applicable"` for
`runner:"claude"` via `RUNNERS_WITHOUT_NATIVE_READBACK`, line ~38). The bug is
solely that the CLI layer never derives/passes the runner.

Do exactly this, entirely within the CLI layer of this one file:

1. **`parseArgs` (line ~202):** add an optional `--runner <claude|codex>` flag.
   Validate the value is one of `claude`/`codex`; an unknown/missing value is an
   error handled like the existing `unknown argument` / `--root requires…`
   errors (CLI returns exit 2). Store as `parsed.runner`.
2. **`main()` (line ~331):** resolve the runner in this precedence:
   - if `--runner` was given, use it;
   - else derive it from the project's V3 source at `options.root` by
     **replicating the canonical `selectedRunner(root, fs)` logic** that already
     lives in `plugins/pipeline-core/lib/project-onboarding-v3.mjs:934`: parse
     `pipeline.user.yaml` via yaml-lite `parseYaml`, take `runners.default`, and
     accept it only if it is one of `claude`/`codex` AND listed in
     `runners.enabled`; otherwise `null`.
   - Fail closed: pass the resolved value straight through to
     `validateV3BootstrapAuthority({ rootDir, deps, runner })`. A `null`/unknown
     result deliberately lands on the Codex fail-closed path (that is the
     existing documented behavior — `RUNNERS_WITHOUT_NATIVE_READBACK.has(null)`
     is false), so an unreadable/ambiguous source is never silently "claude".
   - Use the injected `deps.readFileSync ?? readFileSync` for the read so the
     CLI tests can drive it hermetically (mirror how `main()` already threads
     `deps`).

**Design latitude (yours, justify briefly):** whether to (b) inline a small
private `deriveCliRunner(root, deps)` helper in this file (RECOMMENDED), or (c)
extract `selectedRunner` into a new shared `lib/` helper imported by both files.
**HARD constraint:** you MUST NOT `import` `selectedRunner` from
`project-onboarding-v3.mjs` into this file — that lib already imports
`validateV3BootstrapAuthority` FROM this file, so the import would be circular.
Option (b) avoids that with ~10 lines of duplication; only choose (c) if you
keep it genuinely minimal and it does not perturb `project-onboarding-v3.mjs`
behavior. Prefer (b).

## Field 2 — Context files (read first)

- `plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs` — the ONLY non-test
  file you edit. Study `parseArgs` (~202), `main()` (~331), the exported
  `validateV3BootstrapAuthority` signature (~224, incl. the `runner="codex"`
  default comment), `projectionCurrent` (~100), `RUNNERS_WITHOUT_NATIVE_READBACK`
  (~38).
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs:934` — the canonical
  `selectedRunner(root, fs)` you replicate (read only; do not edit; do not
  import from it).
- `plugins/pipeline-core/lib/yaml-lite.mjs` — `parseYaml`.
- `plugins/pipeline-core/lib/runner-profiles-v3.mjs:196-211` — the schema
  contract: `agent_runtime ∈ {claude-code, other}`;
  `runners.{enabled,default} ∈ {claude, codex}`.
- `plugins/pipeline-core/scripts/v3-bootstrap-authority.test.mjs` — the existing
  suite (it already imports `main as authorityCli`, line ~21; and asserts the
  exported default stays `codex`, lines ~169-170). Extend it; keep those green.

## Field 3 — Definition of Done (checks)

1. `parseArgs` accepts `--runner claude` and `--runner codex`; an unknown value
   or a bare `--runner` with no value returns the usual arg error (CLI exit 2).
2. With no `--runner`, `main()` derives the runner from the V3 source and passes
   it through. `null`/unreadable → Codex fail-closed path (unchanged behavior).
3. **This repo, after your change:**
   `node plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs --root "$PWD"`
   prints `"status": "ready"`, `"runtimeReadback": "not-applicable"`, **exit 0**
   (was `projection-current`/exit 1). Capture the before (via `git stash`) and
   after outputs.
4. `--runner codex` on this repo still yields the Codex native-readback path
   (`projection-current`/exit 1 here — the honest fail-closed record);
   `--runner claude` yields `ready`/exit 0.
5. The exported `validateV3BootstrapAuthority` **signature and `runner="codex"`
   default are UNCHANGED**; `projectionCurrent` and
   `RUNNERS_WITHOUT_NATIVE_READBACK` are UNCHANGED. The two real library call
   sites in `project-onboarding-v3.mjs` (lines ~390, ~1178, which already pass
   `runner`) are UNTOUCHED. Confirm via a caller grep that no other caller's
   behavior changes.
6. New/extended tests in `v3-bootstrap-authority.test.mjs`, hermetic (temp dirs
   or injected `deps`, never depending on the live repo `pipeline.user.yaml`):
   (a) `--runner` parse valid/invalid; (b) derivation → `claude` for a
   `runners.default:"claude"` (+enabled) source; (c) derivation → `codex` for a
   `runners.default:"codex"` source; (d) fail-closed → Codex path for
   missing/unreadable/ambiguous source (e.g. default not in enabled);
   (e) CLI `main()` exit-code mapping: claude source → 0, codex source →
   non-zero on an absent-barrier fixture. Reuse the existing test's fixture
   helpers/`deps` style.
7. `node --test plugins/pipeline-core/scripts/v3-bootstrap-authority.test.mjs`
   passes (exit 0). Report the pass count and confirm the pre-existing cases
   (incl. the ~169-170 default-stays-codex assertions) still pass.
8. Report includes: the option (b)/(c) choice + rationale, the before/after CLI
   outputs, the own-suite count, the caller-grep result, and any observation you
   deliberately did not fix (filed, not silent).

(Full aggregate `verify.mjs` + independent Critic are the Elephant's
post-dispatch responsibility, not yours. Note for the record only: this suite is
registered in `verify.mjs` TEST_SUITES as `v3-bootstrap-authority-tests` and is
green in the aggregate — do NOT edit `verify.mjs`.)

## Field 4 — Prohibitions

- MUST NOT change the exported `validateV3BootstrapAuthority` signature, its
  `runner="codex"` default, `projectionCurrent`, or
  `RUNNERS_WITHOUT_NATIVE_READBACK`. The bug is only the missing CLI derivation.
- MUST NOT `import` from `project-onboarding-v3.mjs` (circular import); replicate
  the small derivation instead.
- MUST NOT edit any file other than
  `plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs` and its test.
  Specifically not `verify.mjs`, `project-onboarding-v3.mjs`, the migration
  libs, `runner-profiles-v3.mjs`, schemas, `pipeline.user.yaml`, or
  `.claude/pipeline-state.json`.
- No new runtime dependencies.
- Commit trailers: include `AI-Assisted: true` and a `Dispatch:` line; NO
  `Co-Authored-By` / `Claude-Session` trailers (GIT-03). Do not push. One atomic
  commit.
- Do not weaken, skip, or platform-gate any real failure to make tests green.

## Field 5 — Stop conditions (return to Elephant, clean, no partial commit)

- Deriving/passing the runner cleanly appears to require editing the exported
  function's default or any forbidden file → STOP and report.
- The yaml-lite parser or source shape does not expose
  `runners.default`/`runners.enabled` as assumed → STOP and report the actual
  shape.
- The existing test baseline cannot be reproduced (failures beyond a clean
  green) before you change anything → STOP (environment problem, not your diff).

## Field 6 — Evidence to return

Diff (or clean-stop reason) + a condensed report covering DoD 1–8 with the
concrete command outputs (the stashed before/after CLI runs showing exit 1→0,
the own-suite pass count, the caller-grep proof), the option (b)/(c) choice and
rationale, and any deliberately unfixed observation.
