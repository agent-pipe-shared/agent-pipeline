# Cost & telemetry log (template)

Copy this file to `telemetry/costs.md` in your own project. At every session
close, append **one row** per session (or per finished work block). It is the
single place where your real per-task model spend accumulates — the raw material
for the periodic price/effort review (see `../policies/model-policy.md`, MP-20 /
MP-21).

**Why track this:** effort is the strongest cost lever *within* a tier, so the
number that matters is the effective cost **per task**, not a headline $/MTok
price. Tracking it per task is the only way to tell whether a tier or an effort
level is actually paying for itself.

## Log

| Date | Session/Block | Role | Tier / Effort | Task (short) | Tokens (in / out) | Est. cost | Notes |
|---|---|---|---|---|---|---|---|
| 2026-01-15 | S4/B2-G1 | Goldfish | Implement tier / medium | Wrote the model policy | 250k in / 30k out | ≈ $0.50 (est.) | first pass, no intervention |
| … | … | … | … | … | … | … | … |

**Conventions**

- **Role** is one of `Elephant`, `Goldfish`, `Critic`, `Workflow`.
- **Tokens** are input / output (plus the cache-read share) exactly as your
  provider's usage view reports them — use the per-subagent attribution where the
  runtime offers it.
- **Est. cost** is *always* a marked estimate derived from a local price table
  (e.g. `../harness/scripts/model-prices.json`, if present). The real per-session
  dollar figure is not delivered machine-readably by the runtime, so this column
  is a calculation aid, never a settled invoice. Never compare $/MTok across model
  generations — a newer generation can emit noticeably more tokens for the same
  text, so raw per-token prices are not comparable across generations (MP-13).
- **Notes** captures anything unusual: an escalation to a higher tier, a model
  fallback, a cache anomaly, a calibration run, or the agent count of a workflow.

**Automation.** If the usage-ledger script (`../harness/scripts/usage-ledger.mjs`)
ships with your setup, it fills the token half automatically at close (read-only —
it only reads local transcripts). The cost column stays a marked estimate; a real
figure that arrives later is folded into the existing row as a dated addendum.

**More.** The full column set — including the maturity metrics (`first-pass y/n`,
`intervention needed y/n`) and the periodic review — lives in
`../policies/model-policy.md` (MP-20 / MP-21). Keep this file lightweight; the
policy is the source of truth for the fuller instrument.

