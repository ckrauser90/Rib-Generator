import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const GENERATED_MARKER = "# Generated CSP for the exported HTML; do not edit this section.";

export function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/(?:^|\s)src(?:\s*=|\s|$)/i.test(match[1]) || !match[2]) continue;
    // HTML parsing normalizes CRLF/CR to LF before CSP hashes are checked.
    const contents = match[2].replace(/\r\n?/g, "\n");
    hashes.add(`'sha256-${createHash("sha256").update(contents).digest("base64")}'`);
  }
  return [...hashes].sort();
}

function exportedHtmlFiles(directory) {
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) {
    throw new Error("The export root must be a real directory, not a symlink.");
  }
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Symlinks are not allowed in the static export.");
    if (entry.isDirectory()) files.push(...exportedHtmlFiles(filename));
    else if (entry.isFile() && /\.html$/i.test(entry.name)) files.push(filename);
  }
  return files.sort();
}

export function createContentSecurityPolicy(hashes, modelUrl) {
  const connections = new Set([
    "'self'", "https://cdn.jsdelivr.net", "https://storage.googleapis.com",
    "https://huggingface.co", "https://*.huggingface.co", "https://*.hf.co",
  ]);
  // A user-configured HTTPS model may live on another host. Include its origin,
  // never its path, query string or credentials in the response header.
  if (modelUrl && !modelUrl.startsWith("/")) {
    const model = new URL(modelUrl);
    if (model.protocol !== "https:") throw new Error("The configured model URL must use HTTPS.");
    connections.add(model.origin);
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net ${hashes.join(" ")}`.trim(),
    "worker-src 'self' blob:",
    `connect-src ${[...connections].join(" ")}`,
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

export function writeSecurityHeaders(outDir, { modelUrl } = {}) {
  const htmlFiles = exportedHtmlFiles(outDir);
  if (htmlFiles.length === 0) throw new Error("No exported HTML was found for CSP generation.");
  const hashes = new Set(htmlFiles.flatMap((filename) => inlineScriptHashes(readFileSync(filename, "utf8"))));
  const policy = createContentSecurityPolicy([...hashes].sort(), modelUrl);
  const headersPath = path.join(outDir, "_headers");
  // Cloudflare treats duplicate path rules as replacements, so add CSP to the
  // existing global rule instead of creating a second /* rule.
  const source = readFileSync(headersPath, "utf8").split(/\r?\n/);
  const lines = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index].trim() === GENERATED_MARKER) {
      // Also remove the duplicate rule written by the earlier generator.
      if (source[index + 1]?.trim() === "/*") index += 1;
      if (/^\s+Content-Security-Policy:/i.test(source[index + 1] ?? "")) index += 1;
    } else {
      lines.push(source[index]);
    }
  }
  let globalRule = lines.findIndex((line) => line.trim() === "/*");
  if (globalRule === -1) {
    lines.push("/*");
    globalRule = lines.length - 1;
  }
  lines.splice(globalRule + 1, 0, GENERATED_MARKER, `  Content-Security-Policy: ${policy}`);
  writeFileSync(headersPath, `${lines.join("\n").trimEnd()}\n`);
  return { policy, htmlFiles: htmlFiles.length, scriptHashes: hashes.size };
}
