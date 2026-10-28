# Dependency review, 2026-10-28

The deployment uses the Cloudflare static export, not a running Next.js server.
The original dependency audit reported six vulnerable packages in the web project
(one critical, four high, one moderate) and two high findings in the optional lab.
These are package counts, not counts of independently reachable application flaws.

## Updates

| Package | Resolved version | Reason and exposure |
| --- | --- | --- |
| Next.js | 15.5.28 | Same major; fixes the audited server advisories, including image-optimizer RCE (GHSA-2464-fhr4-w9xw, GHSA-2xp9-vwfh-vxw4), Windows server RCE (GHSA-p293-qw3h-jr36) and Server Actions DoS (GHSA-p3m5-59mp-jv5r). These server endpoints do not exist in the static Cloudflare deployment; patched dependencies also protect supported local/server workflows. |
| React / React DOM | 19.1.10 | Matching maintenance releases compatible with Next 15; no React package finding was returned by this audit. |
| PostCSS | 8.5.23 | Next still requests 8.4.31. A narrowly scoped override updates only Next's PostCSS to the patched 8.x release; source-map file-disclosure fixes include GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp and GHSA-r28c-9q8g-f849. Build-time processing of hostile CSS/maps would be the relevant exposure; the app does not accept uploaded CSS. |
| sharp | 0.35.5 | Resolves within Next 15.5.28's supported optional dependency range. Fixes audited native image-library issues (GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w). The static deployment has no Next image optimizer, and photo processing occurs in the browser. |
| nanoid | 3.3.20 | Compatible PostCSS dependency update; fixes loop/overflow advisories GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8 and GHSA-xwg4-73v4-xw9w. |
| source-map-js | 1.2.2 | Compatible PostCSS dependency update; fixes source-map event-loop DoS GHSA-68fv-2mgg-jv7q. |
| fflate | 0.8.3 | Compatible update of the development dependency from `@types/three`; fixes malformed ZIP64 DoS GHSA-px8p-9vwx-vf98. The app does not accept ZIP archives. |
| adm-zip (lab only) | 0.6.1 | Narrow override under `onnxruntime-node` preserves the existing 1.23.2 native/model APIs. Fixes the audited allocation, ZIP bomb, symlink/SUID extraction and async decompression issues, including GHSA-xcpc-8h2w-3j85, GHSA-7q85-xj36-vmfc, GHSA-vwc7-r8mq-g2x9 and GHSA-j5f4-cc29-5x44. Native installation extracts downloaded packages; browser uploads do not reach this code. |

Wrangler remains pinned to 4.154.0; the audit returned no finding for it or its
installed dependency tree. Normal TLS/checksum verification and dependency
installation scripts remain enabled. No `audit fix --force` or framework major
upgrade was used.

## Verification and maintenance

After the updates, all three commands returned zero reported vulnerabilities:

```sh
npm audit
npm audit --omit=dev
npm audit --prefix lab
```

The updated lab ZIP reader was checked with the installer's `getEntry` /
`extractEntryTo` API, and native CPU/WebGPU backends remain available. Before
removing the two overrides, check the upstream dependency ranges and rerun the
respective audits. A clean dependency audit does not establish that application
logic or external assets are free of security defects.
