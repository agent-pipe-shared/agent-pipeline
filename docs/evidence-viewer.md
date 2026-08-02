# Evidence Viewer

The Evidence Viewer builds a static, offline HTML projection of one governed
Feature Package. It is deliberately a read-only derived view: opening,
sharing, or editing the report cannot grant, revoke, or change governance
authority.

Build a new report from the repository root:

```bash
node plugins/pipeline-core/scripts/evidence-viewer.mjs build \
  --root "$PWD" \
  --manifest specs/<feature-id>/lifecycle.json \
  --output evidence/<feature-id>.html \
  --sharing private
```

The builder validates the complete Feature Package before projecting it. A
broken digest, topology, or candidate binding produces an explicitly `invalid`
report; it never becomes a pass, approval, or release claim. The report puts
the exact commit/tree binding before its derived summary and labels unavailable,
unknown, invalid, redacted, and legacy values visibly.

Use `--sharing redacted` for a deterministic sharing projection. It replaces
artifact paths with stable ordinal labels and excludes raw prompts, logs,
credentials, private paths, and coordinates. A redacted report is still
non-authoritative and must be accompanied by the separately retained canonical
records for an audit that needs source details.

The output is intentionally create-only: choose a fresh output path for every
build. This prevents the report writer from silently replacing an earlier
artifact. Reports contain no JavaScript, network dependency, or external asset;
the embedded CSP permits only their own inline stylesheet.
