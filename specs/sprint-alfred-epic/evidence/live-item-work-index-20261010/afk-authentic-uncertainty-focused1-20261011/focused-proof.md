# AFK: authentische Unsicherheit nach State-Rename

Die ursprüngliche Einzelprüfung **AFX009S** besteht auf I03 `b2886c88…`: **1 PASS, 0 FAIL, 0 SKIP**. Quellressourcen, Laufzeitdateien und Umgebung blieben erhalten; die Assertions wurden nicht geändert.

Der tatsächliche Rename mit anschließendem Abbruch vor dem Directory-Sync bleibt ein nicht erfolgreich abgeschlossener Schreibvorgang. Die Prüfung bestätigt zurückbehaltene Host-Effekte, eine unsichere State-Dauerhaftigkeit und erhaltene physische Lebenszeit-Nachweise. Der exakte Wert innerhalb `durability-unknown` oder `indeterminate` wurde nicht zusätzlich protokolliert.

Der frühere Sechserlauf auf I03 `1d393c1e…` bleibt als **5 PASS, 1 FAIL** erhalten. Die fünf damaligen Erfolge und dieser neue Einzelerfolg gehören zu unterschiedlichen Quellständen. Dies ist kein gemeinsamer Sechserlauf auf dem neuen Stand und keine Abnahme des gesamten AFK-Themas oder native Host-Bestätigung.

Die eng begrenzte Quelländerung bewahrt nur eine tatsächlich vom Host zurückgegebene unsichere Fehlermeldung nach den bestehenden privaten Aktualitätsprüfungen. Sie erzeugt keine Schreibautorität, Freigabe oder dauerhafte Erfolgsmeldung. Exakte Hashes und getrennte Generationen stehen in `focused-proof.json`.
