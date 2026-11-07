# w253: the create-adr generator, the shipped ADR sidecar schemas and where an ADR becomes accepted (candidate 20, G20-26 / G20-23)

Base: `a3e14b638` (the candidate-20 chain). Built by Goldfish C20-G2026-ADR in the slice clone `scratch/agent-out/s-adr`.
Criterion: AC-108 is the closest accepted criterion; PRD and Spec are unchanged. Held for candidate 20; the Elephant applies the patch to the
chain clone. New plugin files and guard files are plugin source: they follow the protected-source route.

## What

- **New sanctioned script `scripts/create-adr.mjs`.** `--root <root> --slug <slug> --title <title> [--scope global | --modules a,b]
  [--supersedes <adr-id>] [--date YYYY-MM-DD]` writes the pair `docs/adr/draft-<slug>.md` and `.json`: status `proposed`, schema
  `pipeline.architecture-decision.v1` (or `.v2` with `--modules`, ids sorted, unique and checked against the physical OKF map), the date
  defaulting to today (the agent has no clock), the digest already the SHA-256 of the exact Markdown bytes. `--root <root> --slug <slug>
  --refresh` recomputes only the digest after the agent filled in the Markdown, so nobody hashes by hand. It prints the next free ADR
  number and the id the accepted record will get. It is create-only (`wx`), refuses unsafe slugs/titles/dates, leaves no file on refusal, and
  has no status, path or output flag: it never writes `accepted`, `superseded` or `waived`, and `--refresh` refuses a record that is not a
  `proposed` record of that draft id.
- **Both sidecar schemas ship** in `plugins/pipeline-core/schemas/` (byte copies of `schemas/pipeline.architecture-decision.v1.json` and
  `.v2.json`, pinned by test 7.1). `validateArchitectureDecision` reads the plugin copy with `fileURLToPath(new URL("../schemas/...",
  import.meta.url))`; the old `import.meta.url.replace(/^file:\/\//, ...)` plus `../../..` reached only the repository root's `schemas/` and
  was wrong on Windows (in a consumer install the schema was never found and only digest and id were checked).
- **`--validate` now accepts a v2 record** (it hard-rejected anything but v1 before, line 505) and applies the same structural sidecar check
  (`validateArchitectureDecisionSidecar`) that `submit-plan` runs through `inspectArchitectureDecisionAuthoringSources`, because `schema-lite`
  evaluates neither `const`, `pattern`, `minItems`, `uniqueItems` nor `format` (the v2 shape would otherwise be under-validated). It also
  compares the sidecar digest with the sibling Markdown. Result: a sidecar that passes `--validate` passes the submit-plan ADR check.
- **Guard admission.** `CREATE_ADR_SCRIPT` (`lib/guard/constants.mjs`, so `canonicalSanctionedScript` resolves every spelling) and
  `sanctionedCreateAdrArgs` in `command-catalogue.mjs`, called from `sanctionedLifecycleScriptArgs`, exactly where
  `architecture-baseline.mjs` is admitted, i.e. the phases in which the skill tells the agent to write ADRs. Two closed argv shapes, `--root`
  bound to this root, order-free flags, each flag once, path-safe slug/modules/supersedes tokens, a free-text title without control
  characters. Pin: `catalogue-admit-prescribed-lifecycle-verbs.test.mjs` (admitted shapes, 23 refused near-misses, catalogue and real guard).
- **Skill.** `skills/architecture-decision/SKILL.md` names `create-adr.mjs` as the one way, says drafts are `draft-<slug>` and the number is
  assigned at materialization, and states how the statuses change (below).

## Where the authoritative status lives (the digest question) and why the file is `draft-<slug>`

The briefing asked for `docs/adr/NNNN-<slug>` with the next free number at creation. That shape cannot become `accepted` without breaking
the digests the PO's design signature covers, so this is a **deviation from the briefing text, reported, not hidden**:

- The signed package binds each proposal file by path and SHA-256 as a companion (`design-decision-bindings.mjs`, `draft()` / `readSources()`),
  and the manifest row pre-binds the SHA-256 of every file `materialize-architecture` will write.
- An in-place `proposed -> accepted` flip of `docs/adr/NNNN-<slug>.json` changes a companion's bytes (`DDB-REFERENCE-DRIFT`) and its
  `chatSelection.sidecarSha256`; `inspectProspectiveArchitectureManifest` also refuses an output path that is a companion path
  (`DDB-PROSPECTIVE-TARGET-COLLISION`, `architecture-prospective-materialization.mjs:31`), and it demands the proposal path
  `startsWith('docs/adr/draft-')` with `id` equal to the file stem (`:46`). A v1 `architectureDecisions` entry must already be `accepted`
  (`design-decision-bindings.mjs:142-143`), i.e. agent-written, which is exactly the free write the skill forbids.
- The placement that avoids every digest conflict **already exists and is the sanctioned consumer**: the proposal stays `docs/adr/draft-<slug>`
  (`proposed`, its own digest, signed companion, never rewritten) and the ACCEPTED record is a different, new file `docs/adr/NNNN-<slug>`
  whose bytes (Markdown wrapping the approved draft verbatim, sidecar `accepted`, chat selection) the signed manifest row pre-binds.
  `pipeline-state.mjs materialize-architecture` publishes exactly those targets after `approve-plan`, through
  `inspectArchitectureMaterializationTargets` / `publishArchitectureDesignTargets`, and writes the predecessor's sidecar `superseded` when
  `supersedes` is set. So goal (3) needs **no consumer code change**; it is covered by `architecture-prospective-materialization.test.mjs`
  (APM001 to APM018) and by the new test 7.11, which feeds a real `create-adr` proposal to the real manifest inspector.
- The status lives in the sidecar only. The Markdown carries no status line (the accepted Markdown wraps the draft verbatim under
  "Accepted through the canonical aggregate design approval", so a status line in the draft would contradict it).

## Root cause of G20-23 (all three greenfield runs left every ADR `proposed`)

The agents wrote `docs/adr/NNNN-*.{md,json}` as `proposed` records that were never bound by a `pipeline-design-decision-bindings` v2 block with
a prospective manifest. `inspectArchitectureDesign` therefore never reached `decisionSubset.required`, and `materialize-architecture` had
nothing to publish. No step accepts an unbound proposal, and none should: it would be an agent-granted status. The skill named neither the
`draft-` convention nor the binding route.

## Tests

- `scripts/architecture-baseline.test.mjs` (registered suite) gains section 7, cases 7.1 to 7.11: schema byte identity, v2 validation, the
  `fileURLToPath` pin, `--validate` digest drift, the draft pair, next free number, modules, supersedes, refusals, `--refresh`, and the
  round trip through the real prospective manifest inspector. No new test file, so no registration is needed.
- `lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs`: new case `C20 w253 create-adr`.
- One fixture detail: the control-character refusal case uses BEL, because a NUL byte cannot reach an argv at all.

## Deliberately not changed

- **Manifest authoring is still manual.** `create-adr` produces the proposal; the prospective manifest, the chat-selection and origin files
  and the v2 bindings block are still hand-built (the row formulas are in the fixture and in test 7.11). A generator for that chain would be
  the next step to make G20-23 fully mechanical; it is a separate, larger piece (it needs the PO's actual selection text and the signed
  SourceSet registration), so it was not built here.
- **Superseding a predecessor that already has a sidecar.** The manifest inspector's `add()` refuses a present target whose bytes differ from
  the pre-bound postimage (`TARGET-DRIFT`, `:35`), so the superseded predecessor sidecar can be written only when it is absent (a Markdown-only
  historic ADR, as in the fixture). Superseding an already-accepted record with a sidecar needs a consumer change (a signed preimage rule
  and an overwrite lane in `publishArchitectureDesignTargets`). Not built: it widens the authority consumer.
- `REPLACE:` placeholders in a draft are not gated by anything before signing (the design block has such a gate, ADR Markdown does not).
- `architecture-baseline.mjs` `isMain` still builds its path with `import.meta.url.replace(/^file:\/\//, ...)` (line ~633) and the
  architecture-baseline test's own schema path does the same; not the briefed cause. The comment at `architecture-effective-decisions.mjs:20-21`
  ("The root-level schema is not shipped there") is now stale.
- `harness/verify-suites.json`, the inventory, `hooks.json` and `pipeline-state.mjs` are untouched; the new script may need an inventory
  rebaseline entry (the Elephant's step).
- `create-adr.mjs` is not added to the closure list in `lib/guard-maintenance-window.mjs`: that list holds modules imported by kernel
  files, and nothing imports this script (the guard only computes its path string; the shell spawns it).
- No case-completion policy binds `architecture-baseline.test.mjs` or `catalogue-admit-prescribed-lifecycle-verbs.test.mjs`
  (`registerTestCaseCompletion` is absent from both and neither is named in `check-verify-case-completion`), so no case id was registered.

## Deliberate additions beyond the literal briefing

- `--refresh`: without it the briefed outcome (the sidecar passes `--validate` and the submit-plan ADR check on the first try) holds only
  until the agent fills in the Markdown, which changes the digest; the agent would then have to hash by hand again, the pain G20-26 removes.
  It rewrites the digest of a `proposed` draft and nothing else.
- `--validate` compares the digest with the sibling Markdown, and applies the structural sidecar check; both serve "passes on the first try".

## Not proven

Live greenfield retest; Full Verify; Critic review; PO acceptance. The guard admission is shown by the catalogue pin and the real guard
function, not by a live hosted session. Windows behaviour of the new script is not measured.
