docs(adr): record ADR-0103, the close scans infrastructure files with Trivy

Register entry D255, the ADR index row and the governance list for the
Trivy scanner built in the previous commits: default-enabled, applicable
only where tracked files hold a Dockerfile, Terraform file or Kubernetes
manifest, neutral and offline, fail-closed, blocking only findings the
feature added. The rules decided while building, beyond the PO tiles, are
marked as built rules the PO may overrule.

AI-Assisted: true
Dispatch: stage-0 (elephant)
