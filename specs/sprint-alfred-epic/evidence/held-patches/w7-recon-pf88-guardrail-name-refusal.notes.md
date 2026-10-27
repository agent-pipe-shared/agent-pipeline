# Recon notes: PF-88, the Critic diagnostic evidence run cannot name its required guardrail because the shell lane refuses the file name

Read-only recon at candidate e71a104a1e01a2f7b85e9044063ce86f5ee37906. No patch, no clone, no suite, no evidence script,
no preflight and no push step was run; everything below is from reading code. Paths are under `plugins/pipeline-core/`
unless stated. The file names `.claude/pipeline.json` and `.claude/pipeline.yaml` appear below only as prose inside this
notes file; they never appeared in a command of this run.

## 0. Premise check

The briefing premise holds, with one correction: the shell lane does NOT refuse every command that names the file. It
returns early (admits) for the bounded read-only diagnostic classifier (`gate-strength-lane.mjs` line 143,
`isReadOnlyDiagnosticCommand`), for gate-strength-safe git (line 144), for bounded scratch-only words (line 141), for the
one closed script exemption (line 145) and for the signed quality-package route (line 146). The refusal text itself says
reads (cat, rg, head, sha256sum, git diff/log/show) are admitted (lines 184-190). What is refused is any command that is
not one of those shapes and whose lowercased text contains a `GATE_STRENGTH_PATHS` basename (lines 170-175). The
`critic-diagnostic-evidence.mjs` call is a `node` script that writes, so it falls into the refused group the moment a
gate-strength basename is one of its words. Not verified live (no live probe was run).

## 1. The command sequence and where the guardrail path is demanded

Sequence a consumer runs (SKILL.md lines 33-66, 116-126):
1. `scripts/critic-diagnostic-evidence.mjs --root R --spec S --log evidence/L --out evidence/O [--candidate REF]
   [--guardrail PATH]... [--full-verify P] [--pending ID] -- COMMAND ARGS` (usage line 11, `--guardrail` parse line 17).
   It calls `produceCriticDiagnostic` (`lib/critic-diagnostic-producer.mjs` line 37), which requires `HEAD == candidate` and
   a clean tracked tree (lines 39, 45), hashes `spec` and each `--guardrail` path from `git show <commit>:<path>` (lines 31-34, 42-43),
   runs the command, and writes `--out` with flag `wx`. Output schema `pipeline.critic-diagnostic-evidence.v1`.
2. `scripts/critic-dispatch-preflight.mjs --root --base --candidate --spec --guardrail... --evidence O`.
3. `scripts/session-critic-finalizer.mjs admit --request scratch/...json` (request file carries `guardrailPaths`), then the
   fresh Critic, then `finalize`, then `export` (SKILL.md 60-104). Packet creation lives in `critic-packet-preflight.mjs`
   (guardrails from `options.references` of kind `guardrail`, line 553). NOT READ: the packet script's CLI flag grammar.

Where the guardrail path is demanded, and from which source:
- `critic-dispatch-preflight.mjs` line 304-308 reads the candidate `.claude/pipeline.yaml`; lines 310-320 call
  `deriveCriticPacketGovernance` with `changedPaths = git diff --name-only base..candidate` (or the current-artifact scope paths).
  Line 342: `allGuardrails = explicit --guardrail ∪ governance.required ∪ requirement map path`.
- `lib/critic-packet-governance.mjs` `reasonForChangedPath` line 98: if the diff changes any of the yaml manifest, the JSON
  manifest, `.claude/settings.json`, `.claude/guard-config.json`, `pipeline.user.yaml`, it is required with reason
  `changed-manifest`. Lines 160-169: a governance block auto-requires the yaml manifest plus guideline and policy files.
  This is the PF-88 trigger: the Toolbox diff changed the JSON manifest, so the packet requires it.
- Line 348 then validates each evidence file via `validateCriticDiagnostic(..., { guardrails: guardrailReadback })`, and
  `lib/critic-diagnostic-evidence.mjs` line 94 fails `CDI-GUARDRAILS` unless EVERY preflight guardrail (path and sha256)
  is present in the diagnostic's own `guardrails` list. The preflight wraps it as `CDP-EVIDENCE-MODE`
  ("Invalid Critic diagnostic evidence", line 251, `diagnosticCode: CDI-GUARDRAILS`).
- Finding: that failure text does not list the missing path. The only list of required paths is the successful
  result's `governance.required` and `guardrails` (lines 418-419), which is only produced once the evidence already
  passes. So the operator is told neither the name nor the reason; SKILL.md 33-37 only says "every declared guardrail".
  The operator derives it by hand (or learns it from a first run that omits it). This is a second gap behind the refusal.

## 2. Which commands the lane refuses and which it exempts

- `critic-dispatch-preflight.mjs`: exempt (frozen `GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS`, `gate-strength-lane.mjs` lines
  223-231; matched by `gateStrengthShellReadOnlyScriptExemption`, lines 312-331: first word `node`, second word resolving
  exactly onto the enforcing plugin root's script, realpath contained). GST34 pins it for every gate-strength path.
- `critic-diagnostic-evidence.mjs --guardrail <gate-strength path>`: refused with `GUARD-GATE-STRENGTH-SHELL`; no
  exemption entry.
- `session-critic-finalizer.mjs admit|finalize|export`: the paths live in a request JSON file (SKILL.md 68-75), so the
  command text carries no gate-strength name and the lane has nothing to match. Writing that file is a Write-tool action
  on `scratch/`, not a gate-strength path. Not refused by this lane (by reading; not run).
- Packet preflight script: depends on its flag grammar (NOT READ); if it takes `--reference guardrail:<path>` in argv it has
  the same problem.

## 3. Could the diagnostic run take the guardrails without the operator naming them?

Yes, mechanically, with three caveats.

What it would take: `produceCriticDiagnostic` would compute the same `allGuardrails` the preflight computes and hash each
from `git show`. The inputs are all candidate-tree reads: the manifest, a file inventory, and `changedPaths`.
- Caveat A: `changedPaths` needs the review BASE; the diagnostic CLI has no `--base` today (it has `--candidate` only). A
  new optional `--base REF` (or `--auto-guardrails --base REF`) flag is required. Without the base, `changed-manifest`
  cannot be derived (it is diff-dependent), only the governance-block part could.
- Caveat B: the derivation (`candidateInventory`, manifest parse, `deriveCriticPacketGovernance`, requirement map) is
  private to `critic-dispatch-preflight.mjs` lines 301-342. It must be extracted into one shared lib function used by both
  callers, otherwise the two sets drift and `CDI-GUARDRAILS` returns by another route.
- Caveat C: the dispatch-preflight also accepts current-artifact scope (`reviewScope`), where the paths come from the scope
  object. The CLI would need that mode too or document that auto-discovery is range mode only.

Digest binding: stays intact. The produced diagnostic still carries `{path, sha256}` per guardrail
(`producer` line 43; `validateCriticDiagnostic` lines 90-94 re-hash from the candidate commit, line 92). Nothing in the
digest format changes; only the SOURCE of the path list changes. Explicit `--guardrail` stays admitted (merged by set union),
so existing operators and tests are unaffected. A variant not needing a base: loosen line 94 to require only explicit
guardrails and let the packet's own `guardrailReadback` (blob oid + sha256 of the same bytes) carry the auto-required ones.
This is weaker (the diagnostic no longer proves it saw those bytes) although the candidate commit/tree binding plus the
clean-tree and `HEAD == candidate` checks (producer lines 39, 45) already fix all bytes. Recommend against it: it relaxes a
validator that other callers share (`critic-course-admission.mjs`, `critic-diagnostic-packet.mjs`) to dodge a lane problem.

A no-code operator workaround exists today and is noted for the PO, not recommended: a `scratch/` driver script calling
`produceCriticDiagnostic` with `guardrailPaths`, so the name never appears in a Bash command. It is the same indirection the
lane cannot see for any script, which is why it must not be mistaken for a new hole; but it is a workaround that makes the
guard's intent look arbitrary, and nothing sanctions it in SKILL.md.

## 4. Alternative: a second closed exemption for scripts that write only under evidence/

Weaker, and not recommended:
- `GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS` is justified only by being PROVABLY write-free, enforced by GST33 (walk of source and
  transitive plugin-local imports for `FORBIDDEN_WRITE_APIS`, `guard-gate-strength.test.mjs` lines 803-835, plus GST33b
  exception cap of 2 with owners and due dates). `critic-diagnostic-evidence.mjs` imports `mkdirSync`/`writeFileSync` and
  spawns the operator's COMMAND (`captureEvidence`, producer line 44): it fails GST33 by construction.
- A second list ("writes only under evidence/") has no static proof: the written path is argv-driven (`--out`, `--log`),
  validated at runtime by `diagnosticEvidenceLocation`/`newDiagnosticPath`, not by a source walk. Worse, the script executes
  an arbitrary `-- COMMAND ARGS` after `--`; the lane would then admit a command line carrying a gate-strength name AND an
  arbitrary subprocess, so the value restriction (guardrail value must be an exact gate-strength path) has to be enforced
  by a new argv parser in the guard, not by the script. That is a second trust boundary with its own parser, not covered by GST33.
- It widens the lane's trust from "this script cannot write" to "this script writes only where its own arguments say".

## 5. Tests that pin the refusal and the exemption

- `hooks/guard-gate-strength.test.mjs` (TP-6, protected, cannot be edited by a Goldfish): GST14 (reads admitted), GST33 / GST33b
  (write-free walk), GST34 (preflight admitted for every `GATE_STRENGTH_PATHS` rule), GST35 (lookalike script, wrong directory,
  other plugin root stay refused; asserts `/GUARD-GATE-STRENGTH-SHELL/` on stderr via `shell(root, command)`), GST36 (a write
  smuggled next to the exempt script's name stays refused), GST37-38 (stand-down states). Fixture style: `shell(PROJECT_ROOT,
  command)` returns `{ blocked, stderr }`; `governed()` makes a temp governed project.
- `lib/guard/diagnostic-toil-cross-runner.test.mjs` (writable, not in TP-1..13): `test(id, name, run)` registry, helpers
  `allow(command)` and `deny(command, regex)`, each driven through three transports (claude `guard-lifecycle-ready`, codex,
  antigravity) with `inspect(command)` as the shared classifier. DTC010 (line 181-183) is the only gate-strength pin:
  `deny('git checkout HEAD -- project/pipeline.json .claude/pipeline.json', /GUARD-GATE-STRENGTH-SHELL/u)`.
- Others naming the code: `hooks/guard-lifecycle-ready.test.mjs`, `hooks/guard-gate-strength-gmw.test.mjs`,
  `hooks/guard-gate-strength-origin-attestation.test.mjs`, `lib/guard/po-only-discard-boundary.test.mjs`,
  `lib/guard/guard-split-contract.test.mjs` (not read in detail; `lib/guard/` has no file named `*gate-strength*`).
- GST31 pins refusal texts in the three governed hook files against advertising hand-editing as an escape; a text change must keep it green.

RED cases that can be named (new `DTC0xx` cases in the writable file; none run here):
- RED-a: `deny('node plugins/pipeline-core/scripts/critic-diagnostic-evidence.mjs --root . --spec specs/x/spec.md --log evidence/l.log --out evidence/o.json --guardrail <gate-strength json path> -- node --test', /GUARD-GATE-STRENGTH-SHELL/u)`
  (pins today's behaviour, GREEN now; guards against an unsafe second exemption later, so it must stay GREEN after any fix).
- RED-b (fails today, passes with S2): the same refusal text must match `/critic-diagnostic-evidence/u` and name the flag-less route.
- RED-c (fails today, passes with S1): after auto-discovery, `allow('node plugins/pipeline-core/scripts/critic-diagnostic-evidence.mjs ... --base HEAD~1 -- node --test')` (no gate-strength name) is NOT refused. This is trivial for the lane
  (nothing to match), so the real S1 RED lives in the script/producer tests, see below.

## 6. The refusal text

Today (lines 191-196): says to use Edit/Write for CHANGES and that "there is deliberately no in-session override for this
shell-lane refusal itself". It does not name the sanctioned route for the common case, running the diagnostic evidence.
It should, once S1 exists, add one sentence: "If you are producing Critic diagnostic evidence, run
`scripts/critic-diagnostic-evidence.mjs` WITHOUT `--guardrail`; required guardrails are derived from the candidate tree
(use `--base` to give the review base), and the finalizer request file carries any explicit guardrail path." Without S1 it
must NOT say that (it would send the operator to a route that fails `CDI-GUARDRAILS`). Keep GST31 green (no hand-edit advice).

## Classification of gaps

| Gap | Class |
|---|---|
| G1 diagnostic CLI cannot take required guardrails without naming them (producer, CLI, shared derivation) | code-fixable-here (non-protected files; one custody question: `lib/critic-diagnostic-evidence.mjs` is untouched) |
| G2 `CDI-GUARDRAILS` failure does not name the missing/required paths | code-fixable-here (preflight / evidence error detail; one typed field listing required paths) |
| G3 refusal text names no route | po-decision / custody: `lib/guard/gate-strength-lane.mjs` is a guard file |
| G4 pinning tests for G3 | native-host-only for the pin in `guard-gate-strength.test.mjs` (TP-6); the writable `diagnostic-toil-cross-runner.test.mjs` can host an additional pin |
| G5 second exemption (alternative) | po-decision, recommended NO |

## Recommended minimal fix

Auto-discovery (option 3): the Elephant recommendation stands, no code contradicts the digest binding.

Slices, in order:
1. `refactor(critic): extract the Critic guardrail derivation shared by preflight and diagnostic evidence`
   Files: new lib module (e.g. `lib/critic-required-guardrails.mjs`), `scripts/critic-dispatch-preflight.mjs` (calls it,
   behaviour byte-identical). RED: existing `scripts/critic-dispatch-preflight.test.mjs` must stay GREEN; add a unit case that
   a diff changing the JSON manifest yields it in `required` with reason `changed-manifest`.
2. `feat(critic): derive required guardrails in critic-diagnostic-evidence when --base is given`
   Files: `scripts/critic-diagnostic-evidence.mjs` (optional `--base`), `lib/critic-diagnostic-producer.mjs` (merge derived set
   with explicit `--guardrail`), tests in `lib/critic-diagnostic-evidence.test.mjs`. RED: (i) candidate fixture changes the JSON
   manifest, run the CLI with no `--guardrail`, then `preflightCriticDispatch` with the same base/candidate accepts the output
   (today `CDP-EVIDENCE-MODE`/`CDI-GUARDRAILS`); (ii) the produced `guardrails` contain `{path, sha256}` for the manifest and
   `validateCriticDiagnostic` re-hashes it; (iii) explicit `--guardrail` plus derived is a deduplicated union; (iv) no `--base`
   keeps today's behaviour.
3. `fix(critic): list the required guardrails in the CDI-GUARDRAILS preflight failure`
   Files: `scripts/critic-dispatch-preflight.mjs` (failure `details.requiredGuardrailPaths`), its test. RED: failing case now
   carries the list. Marks G2.
4. (PROTECTED / CUSTODY, held patch with batch Critic) `fix(guard): name the flag-less diagnostic route in the gate-strength shell refusal`
   Files: `lib/guard/gate-strength-lane.mjs` (text only, no matcher change), additional pin in
   `lib/guard/diagnostic-toil-cross-runner.test.mjs` (RED-b, writable), and a GST-numbered case in
   `hooks/guard-gate-strength.test.mjs` which is TP-6 protected: that part is native-host-only or needs the PO ceremony.
   Must follow slices 1-2; otherwise the text points at a route that does not work.
No change to `GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS` and no new exemption (GST33 stays the sole write-free proof).

## Confidence

Medium-high on the diagnosis (the `CDI-GUARDRAILS` chain and the lane early-returns were read end to end) and on the
recommended direction. Medium on the packet script's flag grammar and on whether another consumer feeds guardrails to the
diagnostic through an argv path (NOT READ: `critic-packet-preflight.mjs` CLI, `critic-diagnostic-packet.mjs`). Nothing here
was executed, so every behavioural statement is by reading and unverified live.
