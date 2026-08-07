# WP2+WP3 design — Critic delta re-review 2 (round 3 of 4)

**Base:** `8c526dd` · **Head:** `d99e59f` · **Package:** WP2+WP3 combined design
(`specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md`)
**Prior finding IDs under test:** Finding A-D (delta re-review 1,
`wp2wp3-design-critic-delta-review-1-8c526dd.md`)
**Route:** claude-opus-5 at max (requested; effective model identity not
independently observed by the Critic).
**Verdict: FAIL.**

## Harness note (disclosed to the user)

The task-notification carrying this report was flagged by the harness as
matching an "instruction-shaped pattern" (`settings-json`). Reviewed: the
match is on the Critic's own legitimate findings text, which quotes
`~/.claude/plugins/installed_plugins.json` and
`plugins/pipeline-core/hooks/guard-gate-strength.mjs` paths as evidence for
Finding 1 below. Assessed as benign — not prompt injection — and treated as
findings data throughout, never as instructions.

## Findings (all MINOR)

### Finding 1 — §A.3's Finding-C disclosure misstates when the new
`GATE_STRENGTH_PATHS` protection becomes effective

The added paragraph claims an agent session that lands the new entry cannot
also create the allowlist module it protects **in that same session**,
because "the very next write attempt is already refused by the
freshly-edited guard." This contradicts the document's own adjacent claims:
GS-6 matches only the *installed, enforcing* plugin root
(`insideLivePlugin()`), explicitly exempting the source-tree checkout by
design (doc §A.3, corroborated at doc:166-167 and doc:30-31, "on the next
plugin refresh"). An edit to the source tree is therefore not an edit to the
enforcing script; the "re-read on every invocation" property does not
propagate a source-tree edit into the current session. Independently
confirmed against live topology: the enforcing root
(`~/.claude/plugins/cache/agent-pipeline-local/pipeline-core/0.5.2`) is
distinct from the source-tree checkout, and this checkout's
`.claude/settings.json` wires no source-tree hooks. The correct
consequence — that the allowlist module stays freely agent-writable in the
source tree between landing the rule and the next plugin refresh — is not
stated anywhere.

Every other factual claim in the same paragraph verified exactly (the six
existing `GATE_STRENGTH_PATHS` entries are all config, none product source;
GS-6's live-root-only matching; the no-in-session-override quote is
verbatim from the file header; the re-read-per-invocation attribution is
correct).

**Evidence:** design doc §A.3 (the Finding-C disclosure paragraph) vs. the
document's own §A.3 GS-6 description and §A.5/§B.4 "next plugin refresh"
framing; `plugins/pipeline-core/hooks/guard-gate-strength.mjs:102-105,
107-129`; `~/.claude/plugins/installed_plugins.json`.

### Finding 2 — the corrected §A.6 figure (5 files) now contradicts §A.5's
uncorrected counts (4/"these four files")

Finding B's fix landed only at §A.6, which now correctly enumerates by
category (1 `nextAction` shape + 2 companion docs + 1 constant module + 1
guardrail entry = 5). §A.5 still says "plus three companion files" / "these
four files," double-counting `SKILL.md` across its own two bullets (Step 1
and Step 4). Before this rework the two sections agreed (both wrong, both
"four"); now they disagree, reproducing the exact defect Finding B was
raised about at the sibling anchor.

**Evidence:** doc §A.5 (bullets + the "four files" sentence) vs. doc §A.6
(category breakdown, "five files touched in total").

### Finding 3 — the Finding-A disclosure omits the dispatch that wrote it

The disclosure names the original design dispatch and
`WP2-WP3-design-rework`, both below-Design-tier. The dispatch that authored
this very paragraph, `WP2-WP3-design-rework-2` (`dispatch-record.json`,
commit `d99e59f`), also ran on `claude-sonnet-5` with no recorded
rationale, and is not named. This is Finding A's exact shape recurring one
level down.

**Evidence:** doc §A.3 disclosure block (names only `WP2-WP3-design-rework`)
vs. `wp2-wp3-design-rework-2/dispatch-record.json` (`model:
claude-sonnet-5`, commit `d99e59f`). Spec-ref: MP-22/MP-23
(`policies/model-policy.md`).

## Deliberately not flagged (genuinely resolved)

- **Finding D** — §B.8 now carries a real tracking entry (owner
  "implementation dispatch," trigger "once §B.3's action-family shape is
  finalized"); both §B.6 threat-model pointers resolve to it cleanly.
  Threat-model citations verified verbatim.
- Two minor citation imprecisions examined and dropped for lack of
  recoverable consequence (a stale scratchpad-record pointer whose target
  record states the same model; a doc-comment mislabeled as a "file
  header").
- Scope: commit `d99e59f` touches exactly one file (+62/−2); all F1-F8
  corrected passages remain present and unmodified; no registry-cleared
  material was silently touched.

## Trajectory check

Consistent. The one inferential break: the correctly-verified re-read
property was carried one step too far into a same-session conclusion the
verified facts (source-tree exemption) contradict (Finding 1).

## Briefing violations

None. Dispatch supplied references only; neutral finding registry (no
verdict/disposition/rationale) as prior-findings input.

## Round status

Round 3 of 4. All three findings are narrow and textual (correct §A.5's two
counts; add one clause naming the third dispatch; replace the same-session
claim with the plugin-refresh-window statement). A scoped rework is
dispatched next — **round 4 of 4 will be the last delta re-review allowed
for this package; a further FAIL needs a PO course gate, not a fifth
autonomous iteration** (mirrors WP5/PHX-2's round 4 outcome).
