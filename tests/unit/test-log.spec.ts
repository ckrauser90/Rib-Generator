import { expect, test } from "@playwright/test";
import { readTestMode, summarizeAttempts, type TestAttempt } from "../../app/test-log";

const attempt = (patch: Partial<TestAttempt>): TestAttempt => ({
  id: Math.random().toString(36),
  mode: "kamera",
  startedAt: 0,
  durationMs: 10_000,
  photo: "data:image/jpeg;base64,AAAA",
  photoSize: { width: 3000, height: 4000 },
  guided: null,
  photoCheck: { issues: [], metrics: {} },
  outcome: "rib-erstellt",
  stlExported: false,
  details: {},
  ...patch,
});

test("test mode is switched on by the address only", () => {
  expect(readTestMode("?test=1")).toBe(true);
  expect(readTestMode("?modus=pro&test=1")).toBe(true);
  expect(readTestMode("")).toBe(false);
  expect(readTestMode("?test=0")).toBe(false);
});

test("summary counts photos, ribs, time to photo and first-try success per mode", () => {
  const attempts = [
    // Kamera: Durchgang 1 klappt sofort, Durchgang 2 braucht ein neues Foto.
    attempt({ mode: "kamera", durationMs: 8_000 }),
    attempt({ mode: "kamera", durationMs: 12_000, outcome: "neues-foto", photoCheck: { issues: ["unscharf"], metrics: {} } }),
    attempt({ mode: "kamera", durationMs: 10_000 }),
    // Geführt: ein Abbruch ohne Foto, dann klappt es (selbst ausgelöst).
    attempt({ mode: "gefuehrt", photo: null, durationMs: null, outcome: "abgebrochen", photoCheck: null }),
    attempt({ mode: "gefuehrt", durationMs: 20_000, guided: { autoCaptured: true, tilt: null, placement: null, instruction: "Halten …" } }),
  ];
  const [camera, guided] = summarizeAttempts(attempts);
  expect(camera).toMatchObject({
    mode: "kamera",
    attempts: 3,
    photos: 3,
    ribs: 2,
    newPhoto: 1,
    medianSecondsToPhoto: 10,
    photoCheckClean: 2,
    photoCheckIssues: { unscharf: 1 },
    firstTryRate: 0.5,
  });
  expect(guided).toMatchObject({ mode: "gefuehrt", attempts: 2, photos: 1, ribs: 1, autoCaptured: 1, firstTryRate: 0 });
});
