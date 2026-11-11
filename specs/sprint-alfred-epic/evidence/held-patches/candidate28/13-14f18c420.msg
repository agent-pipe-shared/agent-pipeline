fix(guard): admit heal's own flag and any spelling of the project root on Windows

Heal prints --no-goldfish-running as its next step, but the sanctioned shape
refused that flag while the lifecycle was not ready. Root arguments were also
compared byte for byte, so D:/x was refused for D:\x. The check now sees the
canonical spelling on hosts where two spellings name one folder.

AI-Assisted: true
Dispatch: stage-0 (elephant)
