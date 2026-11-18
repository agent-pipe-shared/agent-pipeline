docs(adr): accept ADR 0104 with Option A and record why Option B stopped on recon

The PO released Option B, two build attempts stopped: rule 3 (the Verify input set) is not derivable from the registered Verify record, and rule 2 (the owned commit route) is not testable from committed or registered facts. The PO kept Option A. A future Option B needs a stored provenance field and its own ADR. The index row says accepted.

AI-Assisted: true
Dispatch: stage-0 (elephant)
