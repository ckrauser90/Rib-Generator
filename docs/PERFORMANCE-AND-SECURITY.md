# Performance and security validation

The easy/pro UI and conservative geometry pipeline are retained. MediaPipe initialization
and inference prefer a dedicated worker with transferable ImageBitmap inputs and typed
mask buffers. Browsers without usable worker/OffscreenCanvas support retain the main-thread
implementation. Uploads still reset MediaPipe, and no lower analysis resolution is imposed
without image-quality validation. The decoded photo is used directly; full-resolution RGBA
pixels are no longer copied before inference and read again afterwards.

The 3D preview retains its renderer across parameter changes and pauses drawing when idle,
hidden or outside the viewport. STL exports are binary; triangle coordinates, normals and
print orientation are regression-tested against the former ASCII exporter. Initial
Whittaker smoothing reuses its operator result instead of recomputing it for every point.

The optional native ONNX laboratory is installed separately with `npm run lab:setup`.
Normal deployment keeps optional browser BiRefNet available but excludes duplicate ONNX
WASM assets that its explicitly versioned CDN path supplies. See DEPLOY-CLOUDFLARE.md.

## Reproducible checks

- `npm run test:unit`: workflow, geometry, mask ownership and test-mode isolation.
- `npm run test:security`: generated CSP hashes and export traversal.
- `npm run test:e2e`: production Next build with explicitly enabled synthetic test masks;
  includes camera fallback, mobile flows, STL dimensions and 3D renderer reuse. Set
  `PW_CHROMIUM_PATH` if using an installed Chromium rather than Playwright's browser.
- `npm run build:cloudflare`: public static build with generated security headers.
- `npx wrangler deploy --dry-run`: prepare assets without publishing anything.
- Serve that public build locally with `npx wrangler dev --local --port 3006`, then run
  `npm run test:vision -- http://127.0.0.1:3006`. This loads the real bundled model,
  confirms that a public `?e2eMockSegmenter=1` link cannot bypass real inference, compares
  worker and fallback STL bytes for the reference image, and checks CSP violations.

Never set `NEXT_PUBLIC_ENABLE_E2E_MOCK=1` in Cloudflare production or preview settings.
It is an explicit test-build setting, supplied by Playwright's server configuration.
A static E2E build can set it for the test run, but must be rebuilt without it before
publication. Public builds ignore the mock URL flag by default.

## Scope of security work

Patched dependency advisories and their exposure are recorded in DEPENDENCY-SECURITY.md.
Cloudflare serves static assets; there is no deployed Next server, authentication backend
or database connection in the core workflow. A scan of tracked production sources found
no active HTML-insertion sink or embedded credential. This is a scoped review, not a
claim that every possible vulnerability has been ruled out.

The historical Supabase migration is unused by this app. Its self-writable usage-counter
policies must be revisited before relying on that schema for quotas or billing. Enabling
that backend requires a separate authorization review.

Browser verification here uses Chromium with real model inference and a synthetic image;
iPhone Safari performance and camera hardware still require a device check after deployment.
