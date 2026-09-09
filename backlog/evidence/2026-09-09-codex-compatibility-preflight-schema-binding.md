# Codex compatibility preflight schema binding repair

The standalone intermediate preflight receipt already had terminal code `ok`,
intermediate eligibility, and the exact current intermediate profile digest.
The compatibility reducer classified it as diagnostic-only solely because the
v2 policy pinned the old preflight-schema SHA-256
`8764982d49d5dd4a96ff47730774cced8c051817262de4052ba46d5f0d3b1364`
instead of the current raw schema-byte digest
`a0130aee9c4d437df26fdb1c8e764f0c78e3bc2bc7b5f0d7af218843b7f9a3ce`.

Commit `a70537486796a6aa111137fbbdae756ae98fb73e` expanded the preflight
schema for closed app-server diagnostics. This change updates only the two
current v2 policy schema pins. It does not change the schema, profile digest,
network setting, lane, evidence freshness, eligibility rules, or fallback
allowlist. The mismatch does not establish a timing root cause for the earlier
selection failure.

The regression hashes the shipped schema bytes independently of policy fixture
data. It was red before the two pin corrections
(`evidence/NVA-B-COMPAT-PREFLIGHT-SCHEMA-BINDING-1-red.txt`) and green after:

- `node --test plugins/pipeline-core/lib/codex-sandbox-compatibility.test.mjs`
  — 10 passed; `evidence/NVA-B-COMPAT-PREFLIGHT-SCHEMA-BINDING-1-green.txt`.
- `node --test harness/scripts/check-consumer-safe-paths.test.mjs` — 9 passed;
  `evidence/NVA-B-COMPAT-PREFLIGHT-SCHEMA-BINDING-1-consumer-safe-paths.txt`.
- The pure reducer reconstructed an observation from the already-produced
  standalone receipt and returned `intermediate-preflight-eligible` with
  `exact-evidence`; `evidence/NVA-B-COMPAT-PREFLIGHT-SCHEMA-BINDING-1-reconstructed-reducer.json`.

This reconstructed observation is not a rerun of the earlier failed live
selection and does not invoke a provider or preflight CLI. A parent-owned live
rerun remains separate work.
