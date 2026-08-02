# Release 0.5.0 readiness

| Surface | Required value |
| --- | --- |
| `VERSION` | `0.5.0` |
| Codex manifest | `0.5.0+codex.<cachebuster>` |
| Claude manifest | `0.5.0` |
| Tag | annotated `v0.5.0` at the published Main commit |

The exact candidate must pass Full Verify, Security, and independent
diff-scoped Critic review. Main may update only by fast-forward. The tag is
immutable; later fixes require a new release tag, not moving `v0.5.0`.

---

## Deutsche Lesefassung (nicht normativ)

Vor Veröffentlichung müssen Full Verify, Security Scan und diff-spezifischer
Critic für den exakten Kandidaten grün sein. Main wird nur fast-forward
aktualisiert; `v0.5.0` bleibt unveränderlich.
