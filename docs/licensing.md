# Public Core licensing

The current Public Core candidate uses the Sustainable Use License Version 1.0
(SUL-1.0), SPDX identifier `SUL-1.0`. This is source-available/fair-source
licensing and must not be described as OSI Open Source.

The selected boundary is deliberately standard-near and not an individually
negotiated two-user license:

- internal business use and modification are permitted;
- free redistribution for non-commercial purposes is permitted when the
  license and notices travel with the copy;
- consulting, training, and support may be provided when Agent-Pipeline is not
  itself sold, hosted, white-labelled, embedded, or offered as the paid
  product;
- sale, paid distribution, hosted/SaaS use, managed-service value,
  white-labeling, and product embedding require a separate commercial license;
- there is no automatic conversion to an OSI Open Source license.

`LICENSE` contains the governing text and `NOTICE` contains the project notice
and commercial intake path. `third-party-licenses.json` is the explicit current
dependency inventory; it is empty because this repository has no package
manager dependency manifest. Future dependencies must be added there and
checked against `governance/examples/policies/license-allowlist.json`.

This repository records the PO selection of the standard license for the
current candidate. It does not provide legal advice, does not define prices or
contract terms, and does not silently grant commercial rights. Historic
releases may retain their prior license notices; this current candidate uses
the Public Core policy above.
