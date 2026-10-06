// Welche Erkennung die Kontur liefert: MediaPipe (Standard) oder BiRefNet (zum Testen).
//
// Zweck: Die Entscheidung für MediaPipe (docs/decisions.md R-002) beruht auf 11 Fotos.
// Mit diesem Schalter lässt sich BiRefNet an eigenen Fotos gegenprüfen, ohne Labor.
// Die Wahl kommt aus der Adresse (`?erkennung=birefnet`), sonst aus dem Browser-Speicher;
// geändert wird sie im Pro-Modus. Beide liefern dasselbe Maskenformat, danach läuft
// dieselbe Kontur-Strecke (app/segmentation-workflow.ts).
//
// BiRefNet lädt beim ersten Mal ~224 MB von Hugging Face – Cloudflare liefert Dateien nur
// bis 25 MB aus. Die WASM-Laufzeit kommt von jsDelivr in der installierten Version.
// Gemessen (06.10.): Das Standardmodell braucht mit 1024er-Eingabe ~7 GB Arbeitsspeicher und
// bricht im Browser ab (WASM max. 4 GB). Modell und Größe sind deshalb per Umgebungsvariable
// austauschbar (docs/decisions.md R-008).

export type SegmenterKind = "mediapipe" | "birefnet";

export const DEFAULT_SEGMENTER: SegmenterKind = "mediapipe";

export const SEGMENTER_OPTIONS: { id: SegmenterKind; label: string; hint: string }[] = [
  { id: "mediapipe", label: "MediaPipe (Standard)", hint: "Schnell, startet am Punkt in der Bildmitte." },
  {
    id: "birefnet",
    label: "BiRefNet (Test)",
    hint: "Nur zum Testen: lädt ca. 220 MB und braucht sehr viel Speicher – am Handy nicht lauffähig, am Rechner nur mit Grafikkarte (WebGPU).",
  },
];

/** Schwelle für die Binärmaske je Erkennung (BiRefNet liefert Wahrscheinlichkeiten um 0,5). */
export const MASK_THRESHOLD: Record<SegmenterKind, number> = {
  mediapipe: 0.18,
  birefnet: 0.5,
};

export const BIREFNET_MODEL_URL =
  process.env.NEXT_PUBLIC_BIREFNET_MODEL_URL ??
  "https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx";

/** Eingabegröße des Modells; eine 512er-Fassung über NEXT_PUBLIC_BIREFNET_INPUT_SIZE=512. */
export const BIREFNET_INPUT_SIZE_SETTING = Number(process.env.NEXT_PUBLIC_BIREFNET_INPUT_SIZE) || 1024;

const STORAGE_KEY = "rib-generator.erkennung";

const parse = (value: string | null): SegmenterKind | null =>
  value === "birefnet" || value === "mediapipe" ? value : null;

/** Adresse vor Browser-Speicher vor Standard. */
export const resolveSegmenterChoice = (search: string, stored: string | null): SegmenterKind =>
  parse(new URLSearchParams(search).get("erkennung")) ?? parse(stored) ?? DEFAULT_SEGMENTER;

export const readStoredSegmenter = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const writeStoredSegmenter = (kind: SegmenterKind) => {
  try {
    if (kind === DEFAULT_SEGMENTER) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, kind);
  } catch {
    // Ohne Speicher gilt die Wahl nur bis zum Neuladen.
  }
};
