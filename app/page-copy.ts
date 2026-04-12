import type { WorkProfileSide } from "../lib/contour";

type CurrentStepLabelOptions = {
  anchorEditMode: boolean;
  currentAnchorsConfirmed: boolean;
  hasSourceRaster: boolean;
  markerConfirmed: boolean;
};

type FooterNoteOptions = {
  anchorEditMode: boolean;
  currentAnchorsConfirmed: boolean;
  hasPromptPoint: boolean;
  hasSourceRaster: boolean;
  validationError: string | null;
  validationWarning: string | null;
};

export const pageText = {
  initialStatus: "Foto laden und danach direkt in das Gefaess klicken.",
  readyStatus: "Bereit. Lade ein Foto hoch und klicke in das Gefaess.",
  segmenterLoadError: "MediaPipe konnte nicht geladen werden.",
  segmentationFailed: "Segmentierung fehlgeschlagen.",
  segmentationInProgress: "Kontur wird erkannt...",
  anchorDraftMoved:
    "Start und Ende als Entwurf verschoben. Uebernehmen aktualisiert Rib-Profil, 3D und STL.",
  anchorsReset: "Start und Ende wieder automatisch gesetzt. Bitte erneut bestaetigen.",
  anchorEditActive:
    "Ankerbearbeitung aktiv. Ziehe Start und Ende direkt auf der hellen Kontur.",
  anchorEditCancelled: "Ankerbearbeitung verworfen.",
  anchorsApplied: "Start und Ende uebernommen. Rib-Profil, 3D-Vorschau und STL sind aktualisiert.",
  anchorsConfirmed: "Start und Ende bestaetigt. Jetzt kannst du das Rib fein einstellen.",
  dropImagePrompt: "Bitte ein Bild per Drag-and-Drop hineinziehen.",
  downloadNeedsContour: "Zuerst eine Kontur erkennen, dann STL exportieren.",
  geometryNotExportable: "Die Rib-Geometrie ist noch nicht exportierbar.",
  stlExported: "STL exportiert.",
  diagnosticsCopied: "Diagnose in die Zwischenablage kopiert.",
  diagnosticsCopyFailed: "Diagnose konnte nicht kopiert werden.",
  diagnosticsDownloaded: "Diagnose als JSON exportiert.",
  contourHint: "Ins Gefaess klicken",
  dropzoneHint: 'Foto hier hineinziehen oder oben auf "Foto" klicken',
  previewEmpty: "Kontur folgt nach Klick ins Gefaess",
  anchorApplyLabel: "Uebernehmen",
  anchorResetLabel: "Zuruecksetzen",
} as const;

export const getLoadedImageStatus = (fileName: string, extremeRatio: boolean) =>
  extremeRatio
    ? `"${fileName}" geladen. Format ist speziell. Aktiviere Schritt 1 und setze dann den Marker.`
    : `"${fileName}" geladen. Starte jetzt mit Schritt 1 und setze den Marker im Gefaess.`;

export const getContourReadyStatus = (
  usableColumns: number,
  side: WorkProfileSide,
  anchorsConfirmed: boolean,
) =>
  anchorsConfirmed
    ? `Bereit - ${usableColumns} Messpunkte, ${side === "left" ? "links" : "rechts"}.`
    : "Kontur erkannt - aktuelle Seite ist aktiv. Bei Bedarf wechseln oder Start/Ende direkt ziehen.";

export const getSideSelectedStatus = (side: WorkProfileSide) =>
  `Seite ${side === "left" ? "links" : "rechts"} gewaehlt - Start/Ende-Punkte ziehen zum Anpassen, oder direkt STL herunterladen.`;

export const getDraggingAnchorStatus = (handle: "top" | "bottom") =>
  `${handle === "top" ? "Start" : "Ende"} verschieben...`;

export const getResetSelectionStatus = (hasSourceRaster: boolean) =>
  hasSourceRaster ? "Zurueckgesetzt. Klicke erneut ins Gefaess." : pageText.initialStatus;

export const getCurrentStepLabel = ({
  anchorEditMode,
  currentAnchorsConfirmed,
  hasSourceRaster,
  markerConfirmed,
}: CurrentStepLabelOptions) => {
  if (!hasSourceRaster) {
    return "Schritt 1: Bild hochladen";
  }

  if (!markerConfirmed) {
    return "Schritt 1: Marker setzen und bestaetigen";
  }

  if (!currentAnchorsConfirmed || anchorEditMode) {
    return "Schritt 3: Start und Ende pruefen";
  }

  return "Schritt 4-5: Feintuning und Download";
};

export const getFooterNote = ({
  anchorEditMode,
  currentAnchorsConfirmed,
  hasPromptPoint,
  hasSourceRaster,
  validationError,
  validationWarning,
}: FooterNoteOptions) => {
  if (validationError) {
    return validationError;
  }

  if (validationWarning) {
    return validationWarning;
  }

  if (anchorEditMode) {
    return "Bearbeitung aktiv - Marker auf der Kontur ziehen, dann Uebernehmen.";
  }

  if (!hasSourceRaster) {
    return "Foto hochladen und ins Gefaess klicken - danach links oder rechts waehlen.";
  }

  if (!hasPromptPoint) {
    return "Direkt ins Gefaess klicken um die Kontur zu erkennen.";
  }

  if (!currentAnchorsConfirmed) {
    return "Links oder rechts im Foto waehlen um das Profil zu aktivieren.";
  }

  return "Einstellungen anpassen, dann STL herunterladen.";
};
