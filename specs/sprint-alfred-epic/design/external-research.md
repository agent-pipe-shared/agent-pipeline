# External research — state of the art consulted for the Alfred design (2026-08-27)

Requested by the PO explicitly. Four questions were researched; each section
states the finding and the concrete design consequence. Sources at the end.

## 1. Agent-facing repository knowledge: AGENTS.md is the converged layer

By early 2026, `AGENTS.md` is read natively by effectively every major coding
agent (Claude Code, Codex CLI, Cursor, Copilot, Gemini CLI, Devin, Windsurf,
Amazon Q, Aider) and is governed neutrally (AAIF, alongside MCP). It carries
build/test commands, conventions, and architectural context; complementary
layers exist for capabilities (SKILL.md) and design identity.

**Consequence for D2/D4:** the Agent-First Architecture Standard's navigation
artifacts must *coexist with and reference* AGENTS.md rather than compete with
it: AGENTS.md stays the entry point every foreign agent already reads; the
machine-readable architecture map/contract bundle (OKF-pinned) is what
AGENTS.md points into. #104's own "pluggable representation contract" already
permits this; the design makes AGENTS.md-linkage an explicit property of the
shipped default profile. Confirmed as a real, pinnable target: Google's Open
Knowledge Format v0.1 — markdown files + YAML frontmatter, one concept per
file, normal markdown links forming the graph; spec versioned in
`GoogleCloudPlatform/knowledge-catalog` (`okf/SPEC.md`), digest-pinnable
exactly as #104 requires. Its stated philosophy (human-readable without
tooling, agent-parseable without SDKs) matches this repo's existing canon
conventions, which lowers the D4 backfill cost.

## 2. Architecture enforcement: deterministic gates, agentic proposal — and ratchets are standard practice

The fitness-function literature (Ford/Parsons evolutionary-architecture
lineage; 2025/2026 practice reports) converged on exactly the split #106
gestures at: **deterministic fitness functions remain the primary gatekeepers**
for rule-expressible invariants (dependency direction, contract shape,
policy); **agentic (model-judged) fitness functions** are admitted only for
judgment-heavy, evidence-bound concerns, and only under guardrails —
calibration against past decisions before influence, escalation to humans on
low confidence, scoped evidence, versioned rubrics, and a promotion pathway
that converts recurring agentic findings into deterministic rules. Baseline-
and-ratchet CI enforcement (violations inventoried, net-new blocked, baseline
reduced deterministically) is mainstream, with practice reports of drift
detection moving from quarterly review to per-PR CI.

**Consequence for D3:** #106's "prompt/prose compliance has no gate value" is
extended one notch, as a named principle in the spec: *a model-run evaluator's
verdict can produce `finding` candidates but never `pass`* — pass comes only
from deterministic checks or explicit human acceptance. The promotion pathway
(agentic finding → deterministic rule) becomes D3's designed growth mechanism
instead of ad-hoc rule accretion — which also answers the Verify-growth
consolidation rule (C2): a promoted rule must name the invariant it pins.

## 3. Spec-driven development: the industry converged on Alfred's premise — with one lesson

GitHub Spec Kit (constitution → specify → plan → tasks → implement), Amazon
Kiro, OpenSpec, BMAD-METHOD: specifications as executable contracts that
coordinate agents across the SDLC, with a "constitution" carrying governance
(allowed imports, banned dependencies, compliance requirements) read before
any implementation. This validates the Pipeline's core shape (PRD/Spec
authority, gates, briefed dispatches) as the emerging industry norm rather
than an idiosyncrasy.

**The lesson Alfred adds that the SDD tools lack:** none of them *mechanically
verify* that the agent obeyed the constitution — enforcement is prompt-level.
The 2026-08-27 staging-draft incident is precisely what prompt-level
governance produces (a transcript governed the work while every gate reported
green). Alfred's differentiation, stated in the PRD: governance that is
*checked outside the model* (A-track), *measured* (C-track), and *inherited by
default* (D-track). Where Spec Kit has a constitution file, Alfred has a
constitution with enforcement and telemetry.

## 4. Runner enforcement reality: documented vs measured hook behavior diverges

Official Claude Code/Agent SDK hook documentation states subagent support
directly: `agent_id` and `agent_type` "are populated when the hook fires
inside a subagent"; troubleshooting sections advise PreToolUse hooks precisely
because "subagents do not automatically inherit the main agent's permissions".
Yet this repository measured, four independent ways on 2026-08-27, that
plugin-registered PreToolUse guards did **not** fire inside dispatched
subagents (while Antigravity's did). Documentation and measurement disagree —
version drift, plugin-vs-settings hook sourcing, or a runner defect; the cause
is not established.

**Consequence for A1/A2 (design-shaping):** the design trusts *neither*
direction. WP-A1 makes runner enforcement conformance a standing, cheap,
typed measurement (probe dispatches that attempt guard-refused shapes,
recording fired/not-fired per hook family per runner), consumed by A2's
per-control layer placement and re-run whenever the runner/plugin version
changes. If a runner update makes subagent hooks fire, the conformance record
flips and A2's placement table can relax — mechanically, not by re-reading
docs. Additionally worth an upstream report to the runner vendor once A1
reproduces it minimally (the probe is exactly that reproduction).

## Sources

- [AGENTS.md Complete Guide for Engineering Teams (2026)](https://blog.buildbetter.ai/agents-md-complete-guide-for-engineering-teams-in-2026/)
- [AGENTS.md Specification — ASDLC.io](https://asdlc.io/practices/agents-md-spec/)
- [How to Build Your AGENTS.md — Augment Code](https://www.augmentcode.com/guides/how-to-build-agents-md)
- [Top AI Agent Standards to Know in 2026](https://blog.agentailor.com/posts/top-ai-agent-standards-2026)
- [What Is the Open Knowledge Format (OKF)? — MindStudio](https://www.mindstudio.ai/blog/what-is-open-knowledge-format-okf-google-llm-wiki-standard)
- [OKF SPEC.md — GoogleCloudPlatform/knowledge-catalog](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
- [How the Open Knowledge Format can improve data sharing — Google Cloud Blog](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing)
- [Agentic Fitness Functions — InfoQ (2026-08-17)](https://www.infoq.com/articles/agentic-fitness-functions-evolutionary-architecture/)
- [Stop Architecture Drift: Operationalizing ADRs with Automated Fitness Functions](https://dev.to/alexandreamadocastro/stop-architecture-drift-operationalizing-adrs-with-automated-fitness-functions-22oi)
- [Fitness Functions — continuous-architecture.org](https://continuous-architecture.org/practices/fitness-functions/)
- [GitHub Spec Kit documentation](https://github.github.com/spec-kit/)
- [Comprehensive Guide to Spec-Driven Development: Kiro, Spec Kit, BMAD](https://medium.com/@visrow/comprehensive-guide-to-spec-driven-development-kiro-github-spec-kit-and-bmad-method-5d28ff61b9b1)
- [Best Spec-Driven Development Tools 2026 — Augment Code](https://www.augmentcode.com/tools/best-spec-driven-development-tools)
- [Claude Code Agent SDK — Hooks documentation](https://code.claude.com/docs/en/agent-sdk/hooks)
- [Claude Code Hooks in 2026: A Production Playbook — Totalum](https://www.totalum.app/blog/claude-code-hooks-totalum)
