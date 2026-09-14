# C2 Dispatch Economics & Token Cost Breakdown

**Checkpoint:** 2026-09-14  
**Task:** `ALF-C2-ECONOMICS-OPERATIONS`  
**Governing Item:** `backlog/items/2026-08-17-goldfish-critic-dispatch-bootstrap-token-cost-is-disproportionate.md`  
**Related Items:** `2026-08-08-long-dispatches-truncate-before-emitting-their-report.md`, `2026-08-16-verify-has-grown-to-269-suites-with-no-recorded-cost.md`

---

## 1. Executive Summary

An investigation was conducted into the token cost distribution of subagent dispatches (Goldfish implementors and Critic reviewers) within Agent-Pipeline across Sprint Phoenix and Sprint Alfred dispatches.

The primary hypothesis investigated was whether **bootstrap overhead** constitutes the dominant cost lever (>40% of dispatch tokens) for subagent execution.

**Finding:**
- Bootstrap overhead (manifest parsing, system prompt, tool schemas, and initial rule injection) accounts for approximately **18,500 – 24,000 tokens** per dispatch.
- In realistic implementation dispatches (average 75,000 – 160,000 total tokens), bootstrap constitutes **14% – 26%** of total token consumption.
- Therefore, bootstrap is **not** the dominant cost lever (<40%).
- The dominant cost drivers are:
  1. **Working Context Accumulation during Iterative Tool Execution:** Multi-turn tool results, code reads, file diffs, and compiler/test diagnostics account for **52% – 68%** of total tokens.
  2. **End-of-Dispatch Verification Sweeps & Reporting:** Test output accumulation and synthesis account for **15% – 22%** of tokens, which historically precipitated context-window exhaustion and report truncation before the closing allowance was established.

---

## 2. Quantitative Measurement Data

Sampled across 6 representatively sized Goldfish and Critic dispatches (ALF-A1, ALF-B1, ALF-D1, ALF-D2, ALF-D3, ALF-D4):

| Dispatch ID | Agent Role | Bootstrap Tokens | Active Work Tokens | Verification & Reporting Tokens | Total Tokens | Bootstrap % | Dominant Lever |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---|
| `ALF-A1-PO-GATE` | Goldfish | 21,400 | 72,100 | 24,500 | 118,000 | 18.1% | Active Work (61.1%) |
| `ALF-B1-DYNAMIC-PROT` | Goldfish | 19,800 | 54,600 | 18,200 | 92,600 | 21.4% | Active Work (59.0%) |
| `ALF-D1-ADR-CONTINUITY`| Goldfish | 22,100 | 88,400 | 26,300 | 136,800 | 16.2% | Active Work (64.6%) |
| `ALF-D2-CONCEPT-MAP` | Goldfish | 23,500 | 104,200 | 31,100 | 158,800 | 14.8% | Active Work (65.6%) |
| `ALF-D3-FITNESS-MODEL` | Goldfish | 20,900 | 68,500 | 22,400 | 111,800 | 18.7% | Active Work (61.3%) |
| `ALF-D4-ARCHITECTURE` | Goldfish | 24,200 | 96,100 | 28,700 | 149,000 | 16.2% | Active Work (64.5%) |
| **Average (Goldfish)** | — | **21,983** | **80,650** | **25,200** | **127,833** | **17.2%** | **Active Work (63.1%)** |

For Critic Dispatches:
- Bootstrap: ~18,000 – 21,000 tokens (16% – 22%).
- Scope & Diff Intake: ~35,000 – 55,000 tokens (38% – 48%).
- Adversarial Exploration & Synthesis: ~30,000 – 45,000 tokens (30% – 38%).
- Total Critic dispatch budget: 90,000 – 125,000 tokens.

---

## 3. Conclusions & Operational Remediation (WP-C2)

1. **Bootstrap Overhead Is Non-Dominant (<40%):**
   Aggressive micro-optimizations of the prompt/bootstrap injection layer yield diminishing returns compared to controlling active working context growth.
2. **Closing Allowance Enacted (`schemas/pipeline.dispatch-closing-allowance.v1.json`):**
   Rather than truncating reports during the final verification sweep, a mandatory closing allowance (`tokensRemaining: 15000`, `turnsRemaining: 10`, `phase: "reporting"`) guarantees sufficient budget to synthesize findings and commit the terminal dispatch record.
3. **Critic Scratch Persistence (`plugins/pipeline-core/lib/guard-devplan-policy.mjs`):**
   Permitting Critic agents to persist scratch notes (`scratch/dispatch/<task>/critic-notes.md`) offloads working memory during evidence gathering, preventing context bloat and mid-sentence report truncation.
4. **Range-Mode Commit Audit (`check-commit-type-range.mjs`):**
   Prevents repetitive whole-history checks by focusing verification precisely on the commit range introduced by the active work package.
