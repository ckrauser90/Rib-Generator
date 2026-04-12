"use client";

import styles from "../page.module.css";
import { pageText } from "../page-copy";
import { Rib3DPreview } from "../rib-3d-preview";
import type { Point, ToolHole } from "../../lib/contour";

type Preview3DPanelProps = {
  bevelStrength: number;
  mobileActive: boolean;
  thicknessMm: number;
  toolHoles: ToolHole[];
  toolOutline: Point[];
};

export function Preview3DPanel({
  bevelStrength,
  mobileActive,
  thicknessMm,
  toolHoles,
  toolOutline,
}: Preview3DPanelProps) {
  return (
    <section className={styles.panel} data-mobile-tab="3d" data-mobile-active={mobileActive || undefined}>
      <span className={styles.panelLabel}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        3D-Vorschau
      </span>
      <div className={`${styles.previewWrap} ${styles.previewWrap3d}`} data-testid="rib-3d-shell">
        {toolOutline.length > 1 ? (
          <Rib3DPreview
            outline={toolOutline}
            holes={toolHoles}
            thicknessMm={thicknessMm}
            bevelStrength={bevelStrength}
            className={styles.preview3dMount}
          />
        ) : (
          <div className={styles.previewEmpty}>{pageText.previewEmpty}</div>
        )}
      </div>
    </section>
  );
}
