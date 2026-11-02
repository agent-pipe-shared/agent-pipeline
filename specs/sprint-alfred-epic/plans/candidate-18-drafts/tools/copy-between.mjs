// Scratch: copy files byte for byte from one clone into another. Usage: node scratch/agent-out/copy-between.mjs <from-clone> <to-clone> <path>...
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
const [from, to, ...paths] = process.argv.slice(2);
for (const path of paths) {
  mkdirSync(dirname(join(resolve(to), path)), { recursive: true });
  copyFileSync(join(resolve(from), path), join(resolve(to), path));
  console.log("copied", path);
}
