# Known Issues

## V3 foundation transfer — 2026-07-20

The V3 Public Core transfer is recorded under an explicit PO course exception.
That earlier exception was not and is not a Critic PASS. It remains a transfer
disposition, not a review verdict or release approval.
No push was performed.

The public marketplace URL, its self-application assertions, the current
PO-language failure text, the standing-approved push-gate assertion, the public
inventory baseline, and the three reproduced documentation links were
reconciled on 2026-07-20. The inventory baseline now resolves to the committed
Public V3 Foundation candidate.

| Issue | Scope | Required follow-up |
| --- | --- | --- |
| Recovery-preview callback attestation can accept a no-op callback in the migration library. | V3 migration recovery path | Prioritized design item: [Zustellung der Wiederherstellungsvorschau nachweisen](../backlog/items/2026-07-20-vorschauzustellung.md). |
| Formal review/dispatch aborts can force broad repeat runs without a new domain finding. | Review workflow | Prioritized design item: [Prüfungswiederholungen an gültige Nachweise binden](../backlog/items/2026-07-20-pruefungswiederholung.md). |

## Rücknahmeweg

Solange dieser Stand ausschließlich lokal und unveröffentlicht ist, darf er nur
mit ausdrücklicher Freigabe des PO zurückgenommen werden; der genaue lokale
Umfang ist dabei vor der Rücknahme zu benennen. Nach jeder Veröffentlichung
oder sonstigen Weitergabe erfolgen Rücknahmen ausschließlich durch gewöhnliche
Revert-Commits auf der geteilten Historie. `reset`, `rebase`, Force-Pushes oder
andere Umschreibungen der geteilten Historie sind dafür ausgeschlossen.

Die Änderungen betreffen nur Dokumentation und Backlog-Einträge. Es gibt weder
eine Schema- oder Datenmigration noch eine Laufzeitmigration und daher auch
keinen entsprechenden Migrations- oder Downgrade-Schritt.

The machine-local PO-gate-authority CLI has been removed from the portable
Verify aggregate while its unit/runtime fail-closed behavior remains intact.
The three deterministic secret-like fixture strings were replaced with
non-secret identifiers. Their obsolete worktree suppressions were replaced by
only the exact commit-bound fingerprints required for immutable history; no
path-wide or rule-wide Gitleaks suppression was added.

TP-3 and TP-5 were temporarily removed under explicit PO authorization solely
for these briefed edits. The main session owns restoring both entries exactly
before the final gates. This narrow course authorization is not a Critic PASS,
review verdict, or release approval.
