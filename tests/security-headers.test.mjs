import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createContentSecurityPolicy, inlineScriptHashes, writeSecurityHeaders } from "../scripts/security-headers.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "rib-headers-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "_headers"), "/*\n  X-Content-Type-Options: nosniff\n");
  return root;
}
const hash = (script) => `'sha256-${createHash("sha256").update(script).digest("base64")}'`;

test("hashes exact inline contents, not external scripts, and preserves security headers", (t) => {
  const root = fixture(t);
  const script = 'self.__next_f.push([1,"bootstrap"]);';
  writeFileSync(path.join(root, "index.html"), `<script src="/_next/page.js"></script><script>${script}</script>`);
  mkdirSync(path.join(root, "nested"));
  writeFileSync(path.join(root, "nested", "index.html"), `<script>\nconsole.log("nested");\n</script>`);
  const result = writeSecurityHeaders(root);
  assert.equal(result.htmlFiles, 2);
  assert.equal(result.scriptHashes, 2);
  assert.ok(result.policy.includes(hash(script)));
  assert.ok(result.policy.includes(hash('\nconsole.log("nested");\n')));
  assert.ok(readFileSync(path.join(root, "_headers"), "utf8").includes("X-Content-Type-Options: nosniff"));
  assert.equal(writeSecurityHeaders(root).policy, result.policy);
});

test("changing an inline script refreshes hashes; an unlisted script is not permitted", (t) => {
  const root = fixture(t);
  writeFileSync(path.join(root, "index.html"), "<script>first();</script>");
  const before = writeSecurityHeaders(root).policy;
  writeFileSync(path.join(root, "index.html"), "<script>second();</script>");
  const after = writeSecurityHeaders(root).policy;
  assert.ok(before.includes(hash("first();")));
  assert.ok(!after.includes(hash("first();")));
  assert.ok(after.includes(hash("second();")));
  assert.ok(!after.includes(hash("injected();")));
  const scripts = after.split(";").map((directive) => directive.trim()).find((directive) => directive.startsWith("script-src "));
  assert.ok(!scripts.includes("'unsafe-inline'"));
  assert.ok(!scripts.includes("'unsafe-eval'"));
  assert.ok(scripts.includes("'wasm-unsafe-eval'"));
});

test("allows required worker, camera and model sources without exposing model credentials", () => {
  const policy = createContentSecurityPolicy([], "https://user:password@models.example.org/model.onnx?token=private");
  assert.ok(policy.includes("worker-src 'self' blob:"));
  assert.ok(policy.includes("media-src 'self' blob:"));
  assert.ok(policy.includes("https://models.example.org"));
  assert.ok(policy.includes("https://*.hf.co"));
  assert.ok(!policy.includes("password") && !policy.includes("private"));
  assert.throws(() => createContentSecurityPolicy([], "http://models.example.org/model.onnx"), /HTTPS/);
});

test("normalizes browser HTML line endings when hashing inline scripts", () => {
  assert.deepEqual(inlineScriptHashes("<script>\r\nfirst();\rsecond();</script>"), [hash("\nfirst();\nsecond();")]);
});

test("refuses to follow a symlink outside the static export", (t) => {
  const root = fixture(t);
  const outside = fixture(t);
  writeFileSync(path.join(outside, "index.html"), "<script>outside();</script>");
  symlinkSync(outside, path.join(root, "linked"), "dir");
  assert.throws(() => writeSecurityHeaders(root), /Symlinks/);
});
