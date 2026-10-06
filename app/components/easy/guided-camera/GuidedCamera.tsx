"use client";

// Geführte Aufnahme (Test): eigene Kamera-Ansicht mit Hilfslinien und Live-Prüfung.
//
// Zweck: Fehler bei der Aufnahme verhindern statt später reparieren (docs/decisions.md R-010).
// Über dem Kamerabild liegen Mittellinie und die Zielzone für Rand und Fuß (Gefäß soll
// 60–85 % der Bildhöhe füllen). Live bewertet werden: Handy gerade (Lagesensor), Bild
// scharf (relativ zum schärfsten Bild der letzten Sekunden) und Gefäßgröße (Erkennung auf
// einem kleinen Vorschaubild, ca. jede Sekunde). Der Auslöser ist immer bedienbar; bei Grün
// heißt er „Aufnehmen“, sonst „Trotzdem aufnehmen“.
//
// Abgrenzung: Alles dafür liegt in diesem Ordner und in lib/guided-camera.ts. Die App hängt
// nur über den Knopf in PhotoStep daran. Zum Verwerfen: Ordner, lib-Datei und den Knopf löschen.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { segmentPreviewFromPoint } from "../../../../lib/interactive-segmenter";
import {
  evaluateGuidance,
  laplacianVariance,
  measureMaskPlacement,
  tiltFromGravity,
  type GuidanceState,
} from "../../../../lib/guided-camera";
import styles from "./guided-camera.module.css";

type GuidedCameraProps = {
  onCapture: (file: File) => void;
  onClose: () => void;
  /** Normale Handy-Kamera statt der geführten Aufnahme (z. B. ohne Kamerazugriff). */
  onFallback: () => void;
};

type ZoomRange = { min: number; max: number; value: number };

type MotionPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * iPhones geben den Lagesensor nur nach Rückfrage frei, und nur aus einem Tipp heraus.
 * Deshalb im Klick-Handler des Knopfs aufrufen, bevor die Kamera aufgeht.
 */
export const requestMotionPermission = async () => {
  const motion = (typeof window !== "undefined" ? window.DeviceMotionEvent : undefined) as unknown as
    | MotionPermission
    | undefined;
  if (!motion?.requestPermission) return true;
  try {
    return (await motion.requestPermission()) === "granted";
  } catch {
    return false;
  }
};

const SHARPNESS_WINDOW_MS = 3000;
const ANALYSIS_INTERVAL_MS = 400;

const stateLabel: Record<GuidanceState, string> = { ok: "ok", warn: "prüfen", unknown: "–" };

export function GuidedCamera({ onCapture, onClose, onFallback }: GuidedCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
  const [tilt, setTilt] = useState<{ rollDeg: number; pitchDeg: number } | null>(null);
  const [sharpnessRatio, setSharpnessRatio] = useState<number | null>(null);
  const [placement, setPlacement] = useState<{ fill: number; touchesEdge: boolean } | null>(null);
  const [zoom, setZoom] = useState<ZoomRange | null>(null);
  const [cameraIds, setCameraIds] = useState<string[]>([]);
  const [cameraIndex, setCameraIndex] = useState<number | null>(null);
  const [capturing, setCapturing] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Kamera starten (und bei Kamerawechsel neu starten).
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Dieser Browser erlaubt hier keinen Kamerazugriff (nur über HTTPS möglich).");
        return;
      }
      try {
        const deviceId = cameraIndex !== null ? cameraIds[cameraIndex] : undefined;
        // Manche Handys öffnen keine zweite Kamera, solange die erste läuft.
        if (deviceId) stopStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 3840 }, height: { ideal: 2160 } }
            : { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        stopStream();
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        const track = stream.getVideoTracks()[0];
        const capabilities = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
          zoom?: { min: number; max: number };
        };
        const settings = track.getSettings() as MediaTrackSettings & { zoom?: number };
        setZoom(
          capabilities.zoom && capabilities.zoom.max > capabilities.zoom.min
            ? { min: capabilities.zoom.min, max: capabilities.zoom.max, value: settings.zoom ?? capabilities.zoom.min }
            : null,
        );
        if (cameraIds.length === 0) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((device) => device.kind === "videoinput");
          const backCameras = videoInputs.filter((device) => /back|rück|rear|environment|tele|wide/i.test(device.label));
          setCameraIds((backCameras.length > 1 ? backCameras : videoInputs).map((device) => device.deviceId));
        }
      } catch (cause) {
        const name = cause instanceof DOMException ? cause.name : "";
        setError(
          name === "NotAllowedError"
            ? "Kamerazugriff wurde abgelehnt. In den Browser-Einstellungen erlauben oder die normale Kamera nutzen."
            : "Kamera konnte nicht gestartet werden.",
        );
      }
    };
    void start();
    return () => {
      cancelled = true;
    };
    // cameraIds nur beim ersten Start füllen; ein Wechsel läuft über cameraIndex.
  }, [cameraIndex, stopStream]);

  useEffect(() => () => stopStream(), [stopStream]);

  // Lagesensor: Schwerkraftvektor, leicht geglättet.
  useEffect(() => {
    let smoothed: { x: number; y: number; z: number } | null = null;
    let lastUpdate = 0;
    const onMotion = (event: DeviceMotionEvent) => {
      const gravity = event.accelerationIncludingGravity;
      if (gravity?.x == null || gravity.y == null || gravity.z == null) return;
      const current = { x: gravity.x, y: gravity.y, z: gravity.z };
      smoothed = smoothed
        ? { x: smoothed.x * 0.8 + current.x * 0.2, y: smoothed.y * 0.8 + current.y * 0.2, z: smoothed.z * 0.8 + current.z * 0.2 }
        : current;
      const now = performance.now();
      if (now - lastUpdate > 100) {
        lastUpdate = now;
        setTilt(tiltFromGravity(smoothed.x, smoothed.y, smoothed.z));
      }
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, []);

  // Schärfe und Gefäßgröße aus dem laufenden Bild.
  useEffect(() => {
    const small = document.createElement("canvas");
    const context = small.getContext("2d", { willReadFrequently: true });
    const history: { time: number; value: number }[] = [];
    let tick = 0;
    let segmenting = false;
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || !context || video.readyState < 2 || video.videoWidth === 0) return;
      tick += 1;
      // Schärfe: mittlerer Bildausschnitt, 200 px breit, nur relativ zum besten Wert.
      const sampleWidth = 200;
      const sampleHeight = Math.round((sampleWidth * video.videoHeight) / video.videoWidth);
      small.width = sampleWidth;
      small.height = sampleHeight;
      context.drawImage(video, 0, 0, sampleWidth, sampleHeight);
      const pixels = context.getImageData(sampleWidth * 0.2, sampleHeight * 0.2, sampleWidth * 0.6, sampleHeight * 0.6);
      const gray = new Float32Array(pixels.width * pixels.height);
      for (let index = 0; index < gray.length; index += 1) {
        gray[index] = 0.299 * pixels.data[index * 4] + 0.587 * pixels.data[index * 4 + 1] + 0.114 * pixels.data[index * 4 + 2];
      }
      const now = performance.now();
      history.push({ time: now, value: laplacianVariance(gray, pixels.width, pixels.height) });
      while (history.length > 0 && now - history[0].time > SHARPNESS_WINDOW_MS) history.shift();
      const best = Math.max(...history.map((entry) => entry.value));
      setSharpnessRatio(history.length >= 3 && best > 0 ? history[history.length - 1].value / best : null);

      // Größe: alle zwei Durchläufe, nie zwei Erkennungen gleichzeitig.
      if (tick % 2 === 0 && !segmenting) {
        segmenting = true;
        const preview = document.createElement("canvas");
        preview.width = 256;
        preview.height = Math.round((256 * video.videoHeight) / video.videoWidth);
        preview.getContext("2d")?.drawImage(video, 0, 0, preview.width, preview.height);
        void segmentPreviewFromPoint(preview, { x: 0.5, y: 0.5 }, 0.18)
          .then((mask) => setPlacement(measureMaskPlacement(mask.binaryMask, mask.width, mask.height)))
          .catch(() => setPlacement(null))
          .finally(() => {
            segmenting = false;
          });
      }
    }, ANALYSIS_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  const guidance = evaluateGuidance({ tilt, sharpnessRatio, placement });

  const applyZoom = async (value: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !zoom) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
      setZoom({ ...zoom, value });
    } catch {
      // Zoom nicht änderbar – dann bleibt es beim aktuellen Wert.
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || capturing) return;
    setCapturing(true);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setCapturing(false);
      return;
    }
    stopStream();
    onCapture(new File([blob], "gefuehrte-aufnahme.jpg", { type: "image/jpeg" }));
  };

  const close = () => {
    stopStream();
    onClose();
  };

  const pill = (label: string, state: GuidanceState, detail?: string) => (
    <span className={styles.pill} data-state={state}>
      {label}
      <span className={styles.pillDetail}>{detail ?? stateLabel[state]}</span>
    </span>
  );

  return (
    <div className={styles.layer} role="dialog" aria-modal="true" aria-label="Geführte Aufnahme" data-testid="guided-camera">
      <div className={styles.topBar}>
        <button type="button" className={styles.iconButton} onClick={close} aria-label="Schließen" data-testid="guided-close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <span className={styles.title}>Geführte Aufnahme <span className={styles.badge}>Test</span></span>
        <span className={styles.spacer} />
      </div>

      {error ? (
        <div className={styles.errorBox} role="alert">
          <p>{error}</p>
          <button type="button" className={styles.fallbackButton} onClick={() => { stopStream(); onFallback(); }}>
            Normale Kamera nutzen
          </button>
        </div>
      ) : (
        <div className={styles.stageArea}>
          <div
            className={styles.stage}
            style={videoSize ? ({ "--ar": videoSize.width / videoSize.height } as CSSProperties) : undefined}
          >
            <video
              ref={videoRef}
              className={styles.video}
              playsInline
              muted
              onLoadedMetadata={(event) =>
                setVideoSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })
              }
              data-testid="guided-video"
            />
            <div className={styles.guides} data-size={guidance.size} aria-hidden>
              <span className={styles.centerLine} />
              <span className={styles.rimLine}><span>Rand</span></span>
              <span className={styles.footLine}><span>Fuß</span></span>
            </div>
          </div>
        </div>
      )}

      <div className={styles.bottomBar}>
        <div className={styles.pills} data-testid="guided-status">
          {pill("Gerade", guidance.tilt, tilt ? `${Math.max(tilt.rollDeg, tilt.pitchDeg).toFixed(1).replace(".", ",")}°` : undefined)}
          {pill("Scharf", guidance.sharpness)}
          {pill("Größe", guidance.size, placement ? `${Math.round(placement.fill * 100)} %` : undefined)}
        </div>
        <p className={styles.hint} aria-live="polite">
          {guidance.hint ?? (guidance.ready ? "Passt – jetzt aufnehmen." : "Gefäß zwischen die Linien, Handy aufrecht auf halber Gefäßhöhe.")}
        </p>
        <div className={styles.controls}>
          <div className={styles.sideControls}>
            {zoom && (
              <div className={styles.zoomGroup} role="group" aria-label="Zoom">
                {[1, 2, 3]
                  .filter((value) => value >= zoom.min && value <= zoom.max)
                  .map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={styles.zoomButton}
                      aria-pressed={Math.abs(zoom.value - value) < 0.05}
                      onClick={() => void applyZoom(value)}
                    >
                      {value}×
                    </button>
                  ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className={styles.shutter}
            data-ready={guidance.ready || undefined}
            onClick={() => void capture()}
            disabled={Boolean(error) || capturing}
            aria-label={guidance.ready ? "Aufnehmen" : "Trotzdem aufnehmen"}
            data-testid="guided-shutter"
          >
            <span />
          </button>
          <div className={styles.sideControls}>
            {cameraIds.length > 1 && (
              <button
                type="button"
                className={styles.switchButton}
                onClick={() => setCameraIndex(((cameraIndex ?? 0) + 1) % cameraIds.length)}
              >
                Kamera wechseln
              </button>
            )}
          </div>
        </div>
        <p className={styles.shutterLabel}>{guidance.ready ? "Aufnehmen" : "Trotzdem aufnehmen"}</p>
      </div>
    </div>
  );
}
