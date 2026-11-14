feat(toolchain): Trivy is a registry tool asked for only where infrastructure files exist

- The registry gets the class required-with-infrastructure and its trivy entry
  (install routes from the official release with its checksums file, no sudo);
  docs/toolchain.md and the vendored copy are regenerated.
- The toolchain preflight knows trivy: an explicit entry is no longer an
  unsupported scanner. It probes Trivy only when the tracked files hold a
  trigger file (the adapter's own rule), else not_required; an undecidable tree
  is a probe error. The probe reads the version and the config help and needs
  every switch the close scan passes.
- trivy maps to cap.iac; a deferral works as for a required tool; the onboarding
  consent text names Trivy where such files exist (a consent record stores step
  ids only, so recorded consents stay valid).
- The adapter and the readiness probe join the never-liftable kernel list and
  the threat model's protected assets, since the kernel preflight imports them.
- No start-time readiness finding for Trivy: it would walk and parse the
  tracked YAML and JSON at every session start.

AI-Assisted: true
Dispatch: stage-0 (elephant)
