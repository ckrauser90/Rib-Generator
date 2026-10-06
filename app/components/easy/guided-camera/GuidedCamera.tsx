"use client";

// Geführte Aufnahme (Test): Kamera im Vollbild mit Sucherrahmen und Zielpunkt (Entwurf D3).
//
// Zweck: Fehler bei der Aufnahme verhindern statt später reparieren (docs/decisions.md R-011).
// Das Kamerabild füllt den Bildschirm. Ein Sucherrahmen zeigt, wo das Gefäß stehen soll; ein
// Punkt zeigt, wohin das Handy kippt – er muss in den Kreis. Darunter steht genau ein Satz:
// der wichtigste nächste Handgriff, mit Richtung (aus Entwurf D2). Passt alles eine gute
// Sekunde lang, füllt sich der Kreis und das Foto wird von selbst aufgenommen; der Auslöser
// bleibt jederzeit bedienbar.
//
// Abgrenzung: Alles dafür liegt in diesem Ordner und in lib/guided-camera.ts. Die App hängt
// nur über den Knopf in PhotoStep daran. Zum Verwerfen: Ordner, lib-Datei und den Knopf löschen.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { segmentPreviewFromPoint } from "../../../../lib/interactive-segmenter";
import {
  DEFAULT_BAND,
  GUIDANCE_LIMITS,
  evaluateGuidance,
  holdProgress,
  laplacianVariance,
  measureMaskPlacement,
  targetDotOffset,
  tiltFromGravity,
  type Band,
  type Placement,
  type Tilt,
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
/** Radien im Zielbereich (px): Kreis = Grenzwert, äußerer Kreis = dreifacher Grenzwert. */
const RING_RADIUS = 34;
const OUTER_RADIUS = RING_RADIUS * 3;
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * (RING_RADIUS + 7);

export function GuidedCamera({ onCapture, onClose, onFallback }: GuidedCameraProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const holdSinceRef = useRef<number | null>(null);
  const capturingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [videoInfo, setVideoInfo] = useState("Video: wartet auf Kamera …");
  const [band, setBand] = useState<Band>(DEFAULT_BAND);
  const [tilt, setTilt] = useState<Tilt | null>(null);
  const [sharpnessRatio, setSharpnessRatio] = useState<number | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [zoom, setZoom] = useState<ZoomRange | null>(null);
  const [cameraIds, setCameraIds] = useState<string[]>([]);
  const [cameraIndex, setCameraIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const applyZoom = useCallback(async (value: number, range: ZoomRange | null = null) => {
    const track = streamRef.current?.getVideoTracks()[0];
    const current = range;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
      setZoom((previous) => {
        const base = current ?? previous;
        return base ? { ...base, value } : base;
      });
    } catch {
      // Zoom nicht änderbar – dann bleibt es beim aktuellen Wert.
    }
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
          // Als echte Attribute setzen: WebKit (iPhone, auch Brave/Chrome dort) spielt ein
          // Kameravideo nur stumm und inline ab; React setzt `muted` nur als Eigenschaft.
          video.setAttribute("playsinline", "");
          video.setAttribute("webkit-playsinline", "");
          video.setAttribute("muted", "");
          video.setAttribute("autoplay", "");
          video.muted = true;
          video.srcObject = stream;
          // Nicht abwarten: Auf dem iPhone bleibt play() teils hängen, bis Bilder kommen.
          video.play().then(
            () => setNeedsTap(false),
            () => setNeedsTap(true),
          );
          window.setTimeout(() => {
            if (videoRef.current?.paused) setNeedsTap(true);
          }, 2000);
        }
        const track = stream.getVideoTracks()[0];
        const capabilities = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
          zoom?: { min: number; max: number };
        };
        const settings = track.getSettings() as MediaTrackSettings & { zoom?: number };
        const range =
          capabilities.zoom && capabilities.zoom.max > capabilities.zoom.min
            ? { min: capabilities.zoom.min, max: capabilities.zoom.max, value: settings.zoom ?? capabilities.zoom.min }
            : null;
        setZoom(range);
        // 2× als Start: Mit der Weitwinkel-Hauptkamera müsste man zu nah heran (verzerrt).
        if (range && range.min <= 2 && range.max >= 2) void applyZoom(2, range);
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
  }, [applyZoom, cameraIndex, stopStream]);

  useEffect(() => () => stopStream(), [stopStream]);

  // Sucherrahmen in Bildkoordinaten umrechnen: Das Video füllt den Bildschirm (object-fit:
  // cover) und ist dabei beschnitten; die Erkennung misst aber im ganzen Bild.
  const updateBand = useCallback(() => {
    const layer = layerRef.current;
    const frame = frameRef.current;
    const video = videoRef.current;
    if (!layer || !frame || !video || video.videoWidth === 0) return;
    const layerRect = layer.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const scale = Math.max(layerRect.width / video.videoWidth, layerRect.height / video.videoHeight);
    const shownHeight = video.videoHeight * scale;
    const offsetY = (layerRect.height - shownHeight) / 2;
    const toImage = (screenY: number) => (screenY - layerRect.top - offsetY) / shownHeight;
    setBand({ top: toImage(frameRect.top), bottom: toImage(frameRect.bottom) });
  }, []);

  useEffect(() => {
    window.addEventListener("resize", updateBand);
    return () => window.removeEventListener("resize", updateBand);
  }, [updateBand]);

  // Kurze Diagnose im Test: Kommt überhaupt ein Bild an?
  useEffect(() => {
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      setVideoInfo(
        video.videoWidth > 0
          ? `Video ${video.videoWidth}×${video.videoHeight} · ${video.paused ? "pausiert" : "läuft"}`
          : `Video: noch kein Bild (Status ${video.readyState})`,
      );
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const startPlayback = () => {
    void videoRef.current?.play().then(
      () => setNeedsTap(false),
      () => setNeedsTap(true),
    );
  };

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
      if (now - lastUpdate > 80) {
        lastUpdate = now;
        setTilt(tiltFromGravity(smoothed.x, smoothed.y, smoothed.z));
      }
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, []);

  // Schärfe und Gefäßlage aus dem laufenden Bild.
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

      // Lage: alle zwei Durchläufe, nie zwei Erkennungen gleichzeitig.
      if (tick % 2 === 0 && !segmenting) {
        segmenting = true;
        updateBand();
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
  }, [updateBand]);

  const guidance = evaluateGuidance({ tilt, sharpnessRatio, placement, band });

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || capturingRef.current) return;
    capturingRef.current = true;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      capturingRef.current = false;
      return;
    }
    stopStream();
    onCapture(new File([blob], "gefuehrte-aufnahme.jpg", { type: "image/jpeg" }));
  }, [onCapture, stopStream]);

  // Selbstauslöser: Kreis füllt sich, solange alles passt; dann Foto.
  const ready = guidance.ready;
  useEffect(() => {
    let frame = 0;
    const step = () => {
      const state = holdProgress(holdSinceRef.current, ready, performance.now(), GUIDANCE_LIMITS.holdMs);
      holdSinceRef.current = state.since;
      setProgress(state.progress);
      if (state.progress >= 1) {
        void capture();
        return;
      }
      if (ready) frame = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(frame);
  }, [capture, ready]);

  const close = () => {
    stopStream();
    onClose();
  };

  const dot = targetDotOffset(tilt);
  const tiltOk = guidance.tilt !== "warn";
  const sizeLabel =
    guidance.sizeAdvice === "zurueck" ? "Etwas zurück" : guidance.sizeAdvice === "naeher" ? "Näher heran" : null;

  return (
    <div ref={layerRef} className={styles.layer} role="dialog" aria-modal="true" aria-label="Geführte Aufnahme" data-testid="guided-camera">
      {error ? (
        <div className={styles.errorBox} role="alert">
          <p>{error}</p>
          <button type="button" className={styles.fallbackButton} onClick={() => { stopStream(); onFallback(); }}>
            Normale Kamera nutzen
          </button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            className={styles.video}
            playsInline
            muted
            autoPlay
            onLoadedMetadata={updateBand}
            onPlaying={() => setNeedsTap(false)}
            data-testid="guided-video"
          />

          <div ref={frameRef} className={styles.frame} data-state={guidance.size} aria-hidden>
            <span className={styles.cornerTopLeft} />
            <span className={styles.cornerTopRight} />
            <span className={styles.cornerBottomLeft} />
            <span className={styles.cornerBottomRight} />
            {sizeLabel && <span className={styles.frameLabel}>{sizeLabel}</span>}

            <div className={styles.target} data-tilt={tilt ? (tiltOk ? "ok" : "warn") : "unknown"}>
              <span className={styles.targetArea} style={{ width: OUTER_RADIUS * 2, height: OUTER_RADIUS * 2 }} />
              <svg className={styles.targetRing} width={(RING_RADIUS + 12) * 2} height={(RING_RADIUS + 12) * 2} viewBox={`0 0 ${(RING_RADIUS + 12) * 2} ${(RING_RADIUS + 12) * 2}`}>
                <circle cx={RING_RADIUS + 12} cy={RING_RADIUS + 12} r={RING_RADIUS} className={styles.ringStroke} />
                {progress > 0 && (
                  <circle
                    cx={RING_RADIUS + 12}
                    cy={RING_RADIUS + 12}
                    r={RING_RADIUS + 7}
                    className={styles.progressStroke}
                    strokeDasharray={`${PROGRESS_CIRCUMFERENCE * progress} ${PROGRESS_CIRCUMFERENCE}`}
                    transform={`rotate(-90 ${RING_RADIUS + 12} ${RING_RADIUS + 12})`}
                    data-testid="guided-progress"
                  />
                )}
              </svg>
              {tilt && (
                <span
                  className={styles.dot}
                  style={{ transform: `translate(${dot.x * RING_RADIUS}px, ${dot.y * RING_RADIUS}px)` } as CSSProperties}
                  data-testid="guided-dot"
                />
              )}
            </div>
          </div>

          {needsTap && (
            <button type="button" className={styles.tapToStart} onClick={startPlayback} data-testid="guided-tap-start">
              Kamera starten
            </button>
          )}
        </>
      )}

      <div className={styles.topBar}>
        <button type="button" className={styles.iconButton} onClick={close} aria-label="Schließen" data-testid="guided-close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <span className={styles.title}>Geführte Aufnahme <span className={styles.badge}>Test</span></span>
        {zoom ? (
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
        ) : (
          <span className={styles.spacer} />
        )}
      </div>

      <div className={styles.bottomBar}>
        <div className={styles.instruction} aria-live="polite" data-testid="guided-instruction">
          <strong>{guidance.title}</strong>
          <span>{guidance.detail}</span>
        </div>
        <div className={styles.controls}>
          <span />
          <button
            type="button"
            className={styles.shutter}
            data-ready={guidance.ready || undefined}
            onClick={() => void capture()}
            disabled={Boolean(error)}
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
                aria-label="Kamera wechseln"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 7h-3l-2-3H9L7 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z" /><path d="M9 13a3 3 0 0 1 5-2.2M15 13a3 3 0 0 1-5 2.2" /><polyline points="14 9 14.5 11 12.5 11.3" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <p className={styles.diagnostic} data-testid="guided-diagnostic">{videoInfo}</p>
      </div>
    </div>
  );
}
