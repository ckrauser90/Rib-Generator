"use client";

import styles from "../page.module.css";
import { pageText } from "../page-copy";
import type { ProfileAnchors, ToolHole, Point } from "../../lib/contour";

type OutlineBounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

type ProfilePanelProps = {
  anchorEditMode: boolean;
  currentAnchorsConfirmed: boolean;
  mobileActive: boolean;
  outlineBounds: OutlineBounds | null;
  outlinePath: string;
  outlineViewBox: string;
  profilePreviewPath: string;
  resolvedToolWidthMm: number;
  toolAnchors: ProfileAnchors | null;
  toolHeightMm: number;
  toolHoles: ToolHole[];
  toolOutline: Point[];
  toolProfile: Point[];
};

export function ProfilePanel({
  anchorEditMode,
  currentAnchorsConfirmed,
  mobileActive,
  outlineBounds,
  outlinePath,
  outlineViewBox,
  profilePreviewPath,
  resolvedToolWidthMm,
  toolAnchors,
  toolHeightMm,
  toolHoles,
  toolOutline,
  toolProfile,
}: ProfilePanelProps) {
  return (
    <section className={styles.panel} data-mobile-tab="profil" data-mobile-active={mobileActive || undefined}>
      <span className={styles.panelLabel}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 18 C5 12, 9 6, 12 3 C15 6, 19 12, 21 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Rib-Profil
      </span>
      <div className={styles.previewWrap}>
        {toolOutline.length > 1 && outlineBounds ? (() => {
          const rx = outlineBounds.minX - 6.5;
          const ry1 = outlineBounds.minY;
          const ry2 = outlineBounds.minY + outlineBounds.height;
          const rym = (ry1 + ry2) / 2;
          const bx1 = outlineBounds.minX;
          const bx2 = outlineBounds.minX + outlineBounds.width;
          const bxm = (bx1 + bx2) / 2;
          const by = outlineBounds.minY + outlineBounds.height + 7;
          const fs = Math.max(3.5, outlineBounds.height * 0.04);
          const sw = "0.7";
          const col = "rgba(122,142,110,0.55)";
          const cap = 2.8;

          return (
            <svg className={styles.outlineSvg} data-testid="rib-profile-svg" viewBox={outlineViewBox} preserveAspectRatio="xMidYMid meet" aria-label="2D Rib-Vorschau">
              <rect x={outlineBounds.minX} y={outlineBounds.minY} width={outlineBounds.width} height={outlineBounds.height} fill="rgba(255,255,255,0.001)" />
              <path className={styles.outlinePath} d={outlinePath} />
              {toolHoles.map((hole, index) => (
                <circle key={`${hole.center.x}-${hole.center.y}-${index}`} className={styles.holePath} cx={hole.center.x} cy={hole.center.y} r={hole.radius} />
              ))}
              {toolProfile.length > 1 && <path className={styles.activeProfilePath} d={profilePreviewPath} />}
              {toolAnchors && (anchorEditMode || !currentAnchorsConfirmed) && (
                <>
                  <circle className={styles.anchorDot} cx={toolAnchors.top.x} cy={toolAnchors.top.y} r={5.5} />
                  <text className={styles.anchorLabel} x={toolAnchors.top.x + 9} y={toolAnchors.top.y}>Start</text>
                  <circle className={styles.anchorDot} cx={toolAnchors.bottom.x} cy={toolAnchors.bottom.y} r={5.5} />
                  <text className={styles.anchorLabel} x={toolAnchors.bottom.x + 9} y={toolAnchors.bottom.y}>Ende</text>
                </>
              )}

              <line x1={rx} y1={ry1} x2={rx} y2={ry2} stroke={col} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
              <line x1={rx - cap} y1={ry1} x2={rx + cap} y2={ry1} stroke={col} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
              <line x1={rx - cap} y1={ry2} x2={rx + cap} y2={ry2} stroke={col} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
              <text
                x={rx - fs * 0.6}
                y={rym}
                fontSize={fs}
                fill="rgba(122,142,110,0.8)"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(-90,${rx - fs * 0.6},${rym})`}
              >{toolHeightMm} mm</text>

              <line x1={bx1} y1={by} x2={bx2} y2={by} stroke={col} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
              <line x1={bx1} y1={by - cap} x2={bx1} y2={by + cap} stroke={col} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
              <line x1={bx2} y1={by - cap} x2={bx2} y2={by + cap} stroke={col} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
              <text
                x={bxm}
                y={by + fs * 1.35}
                fontSize={fs}
                fill="rgba(122,142,110,0.8)"
                textAnchor="middle"
                dominantBaseline="hanging"
              >{resolvedToolWidthMm.toFixed(0)} mm</text>
            </svg>
          );
        })() : (
          <div className={styles.previewEmpty}>{pageText.previewEmpty}</div>
        )}
      </div>
    </section>
  );
}
