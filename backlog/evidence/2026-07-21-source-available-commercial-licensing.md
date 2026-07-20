# Source-available licensing closure evidence

Date: 2026-07-21
Backlog item: `pipeline.source-available-commercial-licensing`
Candidate commit: `a798db6d45f2fc113f66d01400d7ea70fcef9427`

## Human disposition

The PO confirmed the Public-Core licensing boundary for this candidate:

- use the standard-near Sustainable Use License Version 1.0 (`SUL-1.0`);
- permit internal business use and free non-commercial redistribution with
  notices;
- require a separate commercial license for commercial sale, paid
  distribution, hosted/managed service, white-label use, or embedding; and
- do not create an individual or lawyer-reviewed two-user license, price, or
  custom contract in this repository.

This is a recorded product/rightsholder disposition, not legal advice and not
an assertion that an attorney reviewed the text. The public release path still
retains its independent release and publication gates.

## Candidate evidence

The candidate binds the same boundary through:

- `LICENSE` — SUL-1.0 terms;
- `LICENSE-DOCS` and `NOTICE` — documentation and notice boundary;
- `docs/licensing.md` — public usage and commercial boundary;
- `CONTRIBUTING.md` and README license surfaces;
- `third-party-licenses.json` — explicit empty dependency inventory; and
- the enabled blocking `license-check` scanner in `.claude/pipeline.yaml`.

The exact candidate's security scan reported `license-check: OK`; no package
source was present for OSV and that condition remained an honest `SKIPPED`, not
a fabricated dependency result. The SUL-1.0 reference is the public SPDX
license text: https://spdx.org/licenses/SUL-1.0.html
