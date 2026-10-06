"use client";

// Testmodus (`?test=1`): protokolliert jeden Aufnahme-Versuch, damit Tests mit echten
// Personen ausgewertet werden können statt nach Bauchgefühl (docs/decisions.md R-012).
//
// Pro Versuch: Aufnahmeweg (Kamera, Galerie, geführt), Zeit vom Knopfdruck bis zum Foto, das
// Foto selbst (verkleinert auf 2048 px), Foto-Check, bei der geführten Aufnahme Neigung und
// Lage beim Auslösen, und wie es ausging (Rib erstellt, neues Foto, abgebrochen, STL geladen).
// Alles bleibt im Browser (IndexedDB), bis „Testdaten exportieren“ eine JSON-Datei erzeugt.
// Ohne `?test=1` passiert nichts davon.
//
// Zusammenspiel: app/page.tsx ruft die Funktionen an den Stellen des einfachen Ablaufs;
// `summarizeAttempts` ist rein und testbar (tests/unit/test-log.spec.ts).

import { useCallback, useEffect, useRef, useState } from "react";
import { triggerBrowserDownload } from "./browser-download";

export type CaptureMode = "kamera" | "galerie" | "gefuehrt" | "ablegen" | "unbekannt";
export type AttemptOutcome = "offen" | "rib-erstellt" | "neues-foto" | "abgebrochen";

export type GuidedCaptureMeta = {
  autoCaptured: boolean;
  tilt: { rollDeg: number; pitchDeg: number } | null;
  placement: { top: number; bottom: number } | null;
  instruction: string;
};

export type TestAttempt = {
  id: string;
  mode: CaptureMode;
  startedAt: number;
  /** Knopfdruck bis Foto in der App; `null`, wenn kein Foto kam. */
  durationMs: number | null;
  photo: string | null;
  photoSize: { width: number; height: number } | null;
  guided: GuidedCaptureMeta | null;
  photoCheck: { issues: string[]; metrics: unknown } | null;
  outcome: AttemptOutcome;
  stlExported: boolean;
  details: Record<string, unknown>;
};

export const readTestMode = (search: string) => new URLSearchParams(search).get("test") === "1";

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Kennzahlen je Aufnahmeweg. „Erster Versuch brauchbar“ = Rib erstellt, ohne dass davor im
 * selben Durchgang ein neues Foto nötig war. Ein Durchgang endet mit „rib-erstellt“.
 */
export const summarizeAttempts = (attempts: TestAttempt[]) => {
  const modes = Array.from(new Set(attempts.map((attempt) => attempt.mode)));
  const firstTry = new Map<CaptureMode, { runs: number; firstTry: number }>();
  let retriesInRun = 0;
  attempts.forEach((attempt) => {
    if (attempt.outcome === "neues-foto" || attempt.outcome === "abgebrochen") retriesInRun += 1;
    if (attempt.outcome === "rib-erstellt") {
      const entry = firstTry.get(attempt.mode) ?? { runs: 0, firstTry: 0 };
      entry.runs += 1;
      if (retriesInRun === 0) entry.firstTry += 1;
      firstTry.set(attempt.mode, entry);
      retriesInRun = 0;
    }
  });
  return modes.map((mode) => {
    const list = attempts.filter((attempt) => attempt.mode === mode);
    const withPhoto = list.filter((attempt) => attempt.photo !== null);
    const issues: Record<string, number> = {};
    list.forEach((attempt) => attempt.photoCheck?.issues.forEach((issue) => (issues[issue] = (issues[issue] ?? 0) + 1)));
    const runs = firstTry.get(mode) ?? { runs: 0, firstTry: 0 };
    return {
      mode,
      attempts: list.length,
      photos: withPhoto.length,
      ribs: list.filter((attempt) => attempt.outcome === "rib-erstellt").length,
      newPhoto: list.filter((attempt) => attempt.outcome === "neues-foto").length,
      stlExported: list.filter((attempt) => attempt.stlExported).length,
      medianSecondsToPhoto: (() => {
        const value = median(withPhoto.flatMap((attempt) => (attempt.durationMs === null ? [] : [attempt.durationMs])));
        return value === null ? null : Math.round(value / 100) / 10;
      })(),
      photoCheckClean: withPhoto.filter((attempt) => attempt.photoCheck && attempt.photoCheck.issues.length === 0).length,
      photoCheckIssues: issues,
      firstTryRate: runs.runs > 0 ? runs.firstTry / runs.runs : null,
      autoCaptured: list.filter((attempt) => attempt.guided?.autoCaptured).length,
    };
  });
};

// ── Speicher im Browser ──

const DB_NAME = "rib-generator-testmodus";
const STORE = "daten";
const KEY = "versuche";

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const loadStored = async (): Promise<TestAttempt[]> => {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve((request.result as TestAttempt[] | undefined) ?? []);
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
};

const store = async (attempts: TestAttempt[]) => {
  try {
    const db = await openDb();
    db.transaction(STORE, "readwrite").objectStore(STORE).put(attempts, KEY);
  } catch {
    // Kein Speicher (z. B. privates Fenster): Die Daten gelten dann bis zum Neuladen.
  }
};

/** Foto auf höchstens 2048 px verkleinern – reicht für die Kontur, hält die Datei handlich. */
const shrinkPhoto = async (file: Blob) => {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      photo: canvas.toDataURL("image/jpeg", 0.88),
      photoSize: { width: image.naturalWidth, height: image.naturalHeight },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
};

const newAttempt = (mode: CaptureMode): TestAttempt => ({
  id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  mode,
  startedAt: Date.now(),
  durationMs: null,
  photo: null,
  photoSize: null,
  guided: null,
  photoCheck: null,
  outcome: "offen",
  stlExported: false,
  details: {},
});

export const useTestLog = (enabled: boolean) => {
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const currentId = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    void loadStored().then(setAttempts);
  }, [enabled]);

  const update = useCallback(
    (change: (list: TestAttempt[]) => TestAttempt[]) => {
      if (!enabled) return;
      setAttempts((previous) => {
        const next = change(previous);
        void store(next);
        return next;
      });
    },
    [enabled],
  );

  const patchCurrent = useCallback(
    (patch: (attempt: TestAttempt) => TestAttempt) => {
      const id = currentId.current;
      if (!id) return;
      update((list) => list.map((attempt) => (attempt.id === id ? patch(attempt) : attempt)));
    },
    [update],
  );

  /** Knopf für eine Aufnahme gedrückt. Ein offener Versuch ohne Foto gilt als abgebrochen. */
  const start = useCallback(
    (mode: CaptureMode) => {
      if (!enabled) return;
      const attempt = newAttempt(mode);
      const previousId = currentId.current;
      currentId.current = attempt.id;
      update((list) => [
        ...list.map((entry) => (entry.id === previousId && entry.outcome === "offen" ? { ...entry, outcome: "abgebrochen" as const } : entry)),
        attempt,
      ]);
    },
    [enabled, update],
  );

  /** Foto ist in der App angekommen. */
  const attachPhoto = useCallback(
    async (file: Blob, mode: CaptureMode, guided: GuidedCaptureMeta | null = null) => {
      if (!enabled) return;
      const current = attempts.find((attempt) => attempt.id === currentId.current);
      if (!current || current.photo !== null || current.mode !== mode) start(mode);
      const arrivedAt = Date.now();
      const shrunk = await shrinkPhoto(file).catch(() => null);
      patchCurrent((attempt) => ({
        ...attempt,
        durationMs: arrivedAt - attempt.startedAt,
        photo: shrunk?.photo ?? null,
        photoSize: shrunk?.photoSize ?? null,
        guided,
      }));
    },
    [attempts, enabled, patchCurrent, start],
  );

  const annotate = useCallback(
    (patch: Partial<Pick<TestAttempt, "photoCheck" | "stlExported">> & { details?: Record<string, unknown> }) =>
      patchCurrent((attempt) => ({
        ...attempt,
        ...patch,
        details: { ...attempt.details, ...(patch.details ?? {}) },
      })),
    [patchCurrent],
  );

  /** Ausgang festhalten. Der erste zählt: Ein erstellter Rib bleibt erstellt. */
  const finish = useCallback(
    (outcome: AttemptOutcome) =>
      patchCurrent((attempt) => (attempt.outcome === "offen" ? { ...attempt, outcome } : attempt)),
    [patchCurrent],
  );

  const exportFile = useCallback(() => {
    const payload = {
      format: "rib-generator-testdaten",
      version: 1,
      exportedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      summary: summarizeAttempts(attempts),
      attempts,
    };
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    triggerBrowserDownload({
      blob: new Blob([JSON.stringify(payload)], { type: "application/json" }),
      fileName: `rib-testdaten-${stamp}.json`,
    });
  }, [attempts]);

  const clear = useCallback(() => {
    currentId.current = null;
    update(() => []);
  }, [update]);

  return { enabled, attempts, start, attachPhoto, annotate, finish, exportFile, clear };
};

export type TestLog = ReturnType<typeof useTestLog>;
