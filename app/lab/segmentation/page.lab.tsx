"use client";

// Laborseite für den Segmentierungs-Vergleich (nur Entwicklung).
//
// Zweck: Stellt die Labor-Funktionen als `window.__ribLab` bereit, damit
// tests/lab sie per Playwright aufrufen kann, und bietet eine kleine Oberfläche,
// um ein eigenes Foto im echten Browser zu testen – inklusive BiRefNet per WebGPU
// für Laufzeitmessungen am Handy.
//
// Zusammenspiel: Die Endung `.lab.tsx` sorgt dafür, dass Next.js die Seite nur
// mit RIB_LAB=1 kennt (siehe next.config.ts). Im normalen Build existiert sie nicht.

import { useEffect, useState, type ChangeEvent } from "react";
import {
  ensureAssetsConfigured,
  ribLab,
  type AnalysisResult,
  type MethodId,
} from "../../../lab/segmentation/browser-harness";

declare global {
  interface Window {
    __ribLab?: typeof ribLab;
    __ribLabReady?: boolean;
  }
}

const METHOD_LABELS: Record<MethodId, string> = {
  mediapipe: "MediaPipe (rot)",
  birefnet: "BiRefNet (blau)",
};

const formatNumber = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? "–" : value.toFixed(digits);

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export default function SegmentationLabPage() {
  const [heightMm, setHeightMm] = useState(120);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Foto wählen, um beide Verfahren zu vergleichen.");
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    ensureAssetsConfigured();
    window.__ribLab = ribLab;
    window.__ribLabReady = true;
  }, []);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("Analysiere … (BiRefNet lädt beim ersten Mal ~220 MB)");
    try {
      const imageDataUrl = await readFileAsDataUrl(file);
      const { backend, result: analysis } = await ribLab.analyzeWithBrowserBiRefNet({
        imageDataUrl,
        heightMm,
      });
      setResult(analysis);
      setMessage(`Fertig. BiRefNet lief über ${backend === "webgpu" ? "WebGPU" : "WASM (CPU)"}.`);
    } catch (error) {
      setMessage(`Fehler: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24 }}>Segmentierungs-Labor</h1>
      <p>MediaPipe <code>magic_touch</code> gegen BiRefNet lite, gleiche Kontur-Strecke wie die App.</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", margin: "16px 0" }}>
        <label>
          Gefäßhöhe (mm){" "}
          <input
            type="number"
            value={heightMm}
            min={20}
            max={400}
            onChange={(event) => setHeightMm(Number(event.target.value) || 120)}
            style={{ width: 80 }}
          />
        </label>
        <label>
          Foto{" "}
          <input type="file" accept="image/*" onChange={handleFile} disabled={busy} />
        </label>
      </div>
      <p role="status">{message}</p>

      {result && (
        <section>
          <table style={{ borderCollapse: "collapse", width: "100%", margin: "12px 0" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Verfahren</th>
                <th>Zeit (ms)</th>
                <th>Kantentreue L/R</th>
                <th>Unruhe L/R (mm)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(METHOD_LABELS) as MethodId[]).map((method) => {
                const entry = result.methods[method];
                return (
                  <tr key={method}>
                    <td>{METHOD_LABELS[method]}</td>
                    <td style={{ textAlign: "center" }}>{formatNumber(entry.timingMs, 0)}</td>
                    <td style={{ textAlign: "center" }}>
                      {formatNumber(entry.edgeAlignment.left)} / {formatNumber(entry.edgeAlignment.right)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {formatNumber(entry.jitterMm.left, 3)} / {formatNumber(entry.jitterMm.right, 3)}
                    </td>
                    <td style={{ textAlign: "center" }}>{entry.ok ? "ok" : entry.error}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p>
            Abstand MediaPipe ↔ BiRefNet (mm, Mittel): links {formatNumber(result.agreementMm.left?.mean)}, rechts{" "}
            {formatNumber(result.agreementMm.right?.mean)}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result.overlay} alt="Overlay beider Konturen" style={{ maxWidth: "100%", height: "auto" }} />
        </section>
      )}
    </main>
  );
}
