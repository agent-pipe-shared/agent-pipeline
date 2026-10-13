// SPDX-License-Identifier: SUL-1.0
/**
 * ALF-C-F2-01 (AC-171): setup must bind the reused signing key pair before it reuses, recovers or anchors it.
 * The private key's derived public key has to equal po-public.pem; a foreign private key is refused with a typed
 * code and nothing is written. Disposable keys and repositories only, under the repository scratch/.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { runHumanApproval } from "./po-human-approval.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");
const PASSPHRASE = "alf-c-f2-01-fixture-passphrase";
const NAME = "Pairing PO";
const created = [];

const pair = () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8", cipher: "aes-256-cbc", passphrase: PASSPHRASE }),
    publicKey: publicKey.export({ format: "pem", type: "spki" }),
  };
};

// Test-only seam: feeds the fixture passphrase to the pairing derivation, which otherwise prompts.
const passinSpawn = (executable, args, options) => {
  const list = Array.isArray(args) ? args : [];
  const derives = list[0] === "pkey" && list.includes("-pubout") && !list.includes("-passin");
  return spawnSync(executable, derives ? [...list, "-passin", `pass:${PASSPHRASE}`] : list, options);
};

function arrange() {
  mkdirSync(SCRATCH, { recursive: true });
  const base = mkdtempSync(join(SCRATCH, "alf-c-f2-01-"));
  created.push(base);
  const root = join(base, "repo");
  const home = join(base, "home");
  const directory = join(home, "po-authority");
  mkdirSync(root, { recursive: true });
  mkdirSync(directory, { recursive: true });
  assert.equal(spawnSync("git", ["init", "-q", root], { encoding: "utf8", shell: false }).status, 0);
  assert.equal(spawnSync("git", ["-C", root, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid",
    "commit", "-q", "--allow-empty", "--no-verify", "-m", "fixture"], { encoding: "utf8", shell: false }).status, 0);
  const files = { privateKey: join(directory, "po-private.pem"), publicKey: join(directory, "po-public.pem"), authority: join(directory, "trust-policy.json") };
  const setup = () => runHumanApproval(["setup", "--repo-root", root, "--directory", directory, "--human-name", NAME],
    { spawn: passinSpawn, homedirFn: () => home, isTTY: true });
  return { directory, files, setup, listing: () => JSON.stringify(Object.values(files).map((file) => existsSync(file))) };
}

const authorityFile = (fx) => fx.files.authority;

test("a matching pair without an authority record is recovered (control)", () => {
  const fx = arrange();
  const keys = pair();
  writeFileSync(fx.files.privateKey, keys.privateKey, { mode: 0o600 });
  writeFileSync(fx.files.publicKey, keys.publicKey, { mode: 0o600 });
  const result = fx.setup();
  assert.equal(result.code, "PO-HUMAN-AUTHORITY-READY");
  assert.equal(result.recovered, true);
});

test("recovery refuses a private key that does not belong to po-public.pem and writes nothing", () => {
  const fx = arrange();
  writeFileSync(fx.files.privateKey, pair().privateKey, { mode: 0o600 });
  writeFileSync(fx.files.publicKey, pair().publicKey, { mode: 0o600 });
  const privateBefore = readFileSync(fx.files.privateKey);
  const publicBefore = readFileSync(fx.files.publicKey);
  assert.throws(() => fx.setup(), (error) => error.code === "PO-KEY-PAIR-MISMATCH" && /PO-KEY-PAIR-MISMATCH/u.test(error.message));
  assert.equal(existsSync(authorityFile(fx)), false, "no authority record is written");
  assert.deepEqual(readFileSync(fx.files.privateKey), privateBefore);
  assert.deepEqual(readFileSync(fx.files.publicKey), publicBefore);
});

test("reuse of a complete directory refuses a swapped-in foreign private key and rewrites nothing", () => {
  const fx = arrange();
  const keys = pair();
  writeFileSync(fx.files.privateKey, keys.privateKey, { mode: 0o600 });
  writeFileSync(fx.files.publicKey, keys.publicKey, { mode: 0o600 });
  assert.equal(fx.setup().recovered, true);
  const idempotent = fx.setup();
  assert.equal(idempotent.code, "PO-HUMAN-AUTHORITY-READY");
  assert.equal(idempotent.recovered, false);

  writeFileSync(fx.files.privateKey, pair().privateKey, { mode: 0o600 });
  const swapped = readFileSync(fx.files.privateKey);
  const authorityBefore = readFileSync(authorityFile(fx));
  assert.throws(() => fx.setup(), (error) => error.code === "PO-KEY-PAIR-MISMATCH");
  assert.deepEqual(readFileSync(fx.files.privateKey), swapped);
  assert.deepEqual(readFileSync(authorityFile(fx)), authorityBefore);
});

after(() => { for (const base of created) rmSync(base, { recursive: true, force: true }); });
