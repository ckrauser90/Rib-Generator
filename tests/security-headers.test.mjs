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

test("CSP shares the global rule with baseline headers and preserves later path rules", (t) => {
  const root = fixture(t);
  const baseline = "/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n\n/private/*\n  Cache-Control: no-store\n";
  writeFileSync(path.join(root, "_headers"), baseline);
  writeFileSync(path.join(root, "index.html"), "<script>bootstrap();</script>");
  writeSecurityHeaders(root);
  const first = readFileSync(path.join(root, "_headers"), "utf8");
  writeSecurityHeaders(root);
  assert.equal(readFileSync(path.join(root, "_headers"), "utf8"), first);
  const activeLines = first.split("\n").filter((line) => line.trim() && !line.trim().startsWith("#"));
  assert.equal(activeLines.filter((line) => line === "/*").length, 1);
  const privateRule = activeLines.indexOf("/private/*");
  const globalHeaders = activeLines.slice(1, privateRule);
  assert.ok(globalHeaders.some((line) => line.includes("Content-Security-Policy:")));
  assert.ok(globalHeaders.includes("  X-Content-Type-Options: nosniff"));
  assert.ok(globalHeaders.includes("  X-Frame-Options: DENY"));
  assert.equal(activeLines[privateRule + 1], "  Cache-Control: no-store");
});

test("repairs the previous generated duplicate global rule without losing baseline headers", (t) => {
  const root = fixture(t);
  writeFileSync(path.join(root, "index.html"), "<script>bootstrap();</script>");
  const file = path.join(root, "_headers");
  writeFileSync(file, readFileSync(file, "utf8") + "\n# Generated CSP for the exported HTML; do not edit this section.\n/*\n  Content-Security-Policy: default-src 'none'\n");
  writeSecurityHeaders(root);
  const headers = readFileSync(file, "utf8");
  assert.equal(headers.split("\n").filter((line) => line === "/*").length, 1);
  assert.ok(headers.includes("X-Content-Type-Options: nosniff"));
  assert.ok(!headers.includes("default-src 'none'"));
});
