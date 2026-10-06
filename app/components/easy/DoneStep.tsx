"use client";

// Schritt 3: Die fertige Rib als 3D-Modell, Maße und STL-Download (Entwurf A3).
//
// Alles Weitere (Glättung, Fase, Breite, Dicke, Formverstärkung) liegt im Pro-Modus.
// Kann die STL nicht erzeugt werden, steht der Grund direkt über dem Knopf.

import type { Point, ToolHole, WorkProfileSide } from "../../../lib/contour";
import { Rib3DPreview } from "../../rib-3d-preview";
import { findShrinkagePreset, formatMm } from "../../shrinkage";
import styles from "./easy.module.css";

export type DoneStepProps = {
  bevelStrength: number;
  blockedReason: string | null;
  canDownload: boolean;
  ribHeightMm: number;
  ribWidthMm: number;
  shrinkagePercent: number;
  targetHeightMm: number;
  thicknessMm: number;
  toolHoles: ToolHole[];
  toolOutline: Point[];
  workProfileSide: WorkProfileSide;
  onDownload: () => void;
  onNewPhoto: () => void;
  onOpenPro: () => void;
};

export function DoneStep({
  bevelStrength,
  blockedReason,
  canDownload,
  ribHeightMm,
  ribWidthMm,
  shrinkagePercent,
  targetHeightMm,
  thicknessMm,
  toolHoles,
  toolOutline,
  workProfileSide,
  onDownload,
  onNewPhoto,
  onOpenPro,
}: DoneStepProps) {
  const preset = findShrinkagePreset(shrinkagePercent);
  const shrinkageText = shrinkagePercent > 0
    ? `Für ${preset ? preset.label : "deinen Ton"} (${String(shrinkagePercent).replace(".", ",")} %) vergrößert – nach dem Brand ${formatMm(targetHeightMm)}.`
    : "Ohne Schwindungsausgleich.";

  return (
    <>
      <div className={styles.intro}>
        <h1 className={styles.title}>Deine Rib ist fertig</h1>
        <p className={styles.lead}>
          Passt genau zur {workProfileSide === "left" ? "linken" : "rechten"} Seite deines Gefäßes. {shrinkageText}
        </p>
      </div>

      <div className={`${styles.visual} ${styles.previewFrame}`} data-testid="easy-3d">
        {toolOutline.length > 1 ? (
          <Rib3DPreview outline={toolOutline} holes={toolHoles} thicknessMm={thicknessMm} bevelStrength={bevelStrength} className={styles.preview3d} />
        ) : (
          <p className={styles.muted}>Noch keine Rib – geh einen Schritt zurück.</p>
        )}
        <span className={styles.chipBottom}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a9 9 0 1 1-3-6.7" /><polyline points="21 3 21 9 15 9" />
          </svg>
          Wischen zum Drehen
        </span>
      </div>

      <div className={styles.controls}>
        <dl className={styles.tiles}>
          <div><dt>Höhe</dt><dd data-testid="easy-rib-height">{formatMm(ribHeightMm)}</dd></div>
          <div><dt>Breite</dt><dd>{formatMm(ribWidthMm)}</dd></div>
          <div><dt>Dicke</dt><dd>{formatMm(thicknessMm)}</dd></div>
        </dl>

        {blockedReason && <p className={styles.errorNote}>{blockedReason}</p>}

        <button type="button" className={styles.primaryButton} disabled={!canDownload} onClick={onDownload} data-testid="easy-download-button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          STL herunterladen
        </button>

        <button type="button" className={styles.proCard} onClick={onOpenPro} data-testid="easy-pro-button">
          <span className={styles.proIcon} aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          </span>
          <span className={styles.proText}>
            <strong>Pro-Modus</strong>
            <span className={styles.muted}>Glättung, Fase, Breite, Dicke, Formverstärkung</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
        </button>

        <button type="button" className={styles.textButton} onClick={onNewPhoto}>Neues Foto</button>
      </div>
    </>
  );
}
