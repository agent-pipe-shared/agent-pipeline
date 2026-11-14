# Trivy IaC/container adapter — design note (candidate 29e, built while the PO is AFK)

Authority: PO 28d tile 4 (Trivy IaC/container adapter, `trivy config`, offline built-in rules, blocks from HIGH, runs only
when such files exist), tile 5 (official release, verified checksum, ~/.local/bin, no sudo), 28e (blockers before Trivy;
Trivy is a separately exportable part), ADR-0092 (Trivy required only where a project has infrastructure or container files).
The details below are stricter than the tile and go into a new ADR + register entry (EL-04); T8 in afk-tiles-29d.md asks
the PO to confirm the timing/install. NOT in this candidate: a Trivy baseline (new-only blocking) — the tile says "blocks
from high", so every HIGH/CRITICAL FAIL blocks.

## Measured (v0.76.2, offline, captures in scratch/trivy-probe/cap-*)
- `trivy config --format json --skip-check-update --cache-dir <empty> --exit-code 0 <root>`: no network; stderr carries
  tab-separated `<ts>\t<LEVEL>\t[<component>] <msg>\t<kv>` lines; one expected
  `ERROR\t[misconfig] Falling back to embedded checks` line.
- Broken `.tf`: only `ERROR\t[terraform parser] Error parsing file ... file_path="main.tf"`; exit 0; no result for the file.
- Broken k8s YAML: nothing at all (no line, no result).
- Results[]: `{Target, Class:"config", Type: terraform|dockerfile|kubernetes, Misconfigurations[{ID, Severity, Status,
  CauseMetadata.StartLine, Title, Message}]}`; terraform root module appears as Target ".", files with failures also as
  their own Target.

## Rules
1. Applicability decided by the Pipeline, without the binary, from the scan root's tracked files (the candidate snapshot):
   Dockerfile/Containerfile (basename `Dockerfile`, `Containerfile`, `Dockerfile.*`, `*.dockerfile`), `*.tf`, and
   `*.yaml|*.yml|*.json` whose top level has string `apiVersion` and `kind`. None → status `not-applicable`, no spawn.
2. Invocation always offline: the args above, a private scratch cache dir, `TRIVY_NO_PROGRESS=true`, no `--server`.
3. Fail closed:
   - nonzero exit, timeout, unparseable JSON, missing `Results` array, SchemaVersion ≠ 2 → scanner_error;
   - any stderr line at level ERROR/FATAL other than exactly the embedded-checks fallback → scanner_error (names
     component and file_path when present);
   - every Dockerfile and k8s trigger file must appear as a Result Target; every directory holding a `.tf` trigger must
     appear as a terraform Target (`.` for the scan root, else the relative dir) or hold a terraform file Target →
     otherwise scanner_error "trigger file not scanned".
4. Findings: Status FAIL only; severity CRITICAL→critical, HIGH→high, MEDIUM→medium, LOW→low, UNKNOWN/other→medium;
   rule = ID; path = Target (relative, forward slashes; "." never used as a finding path for file targets); line =
   CauseMetadata.StartLine or null. blockOn (default high) decides blocking, as for every scanner.
5. Version: record `trivy --version` identity like the other tools; the ERROR-line grammar is pinned by fixtures of 0.76.2.
6. Registry: toolchain entry `trivy`, class conditional ("required when infrastructure or container files exist"),
   readiness finding only when trigger files exist; docs/toolchain.md regenerated.

## Open questions for advisor before building
- Which closed lists must name the new scanner (SECURITY_ELEMENTS, capability map, evaluator, close status, manifest
  schema `security.scanners.trivy.enabled`, onboarding consent text)?
- Does `not-applicable` exist as a scanner status in the v2 evidence today (license-check? osv with no lockfile?) or is it
  a new status that every reader must accept?
