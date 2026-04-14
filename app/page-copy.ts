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
  initialStatus: "Foto laden und danach direkt in das Gefäß klicken.",
  readyStatus: "Bereit. Lade ein Foto hoch und klicke in das Gefäß.",
  segmenterLoadError: "MediaPipe konnte nicht geladen werden.",
  segmentationFailed: "Segmentierung fehlgeschlagen.",
  segmentationInProgress: "Kontur wird erkannt...",
  anchorDraftMoved:
    "Start und Ende als Entwurf verschoben. Übernehmen aktualisiert Rib-Profil, 3D und STL.",
  anchorsReset: "Start und Ende wieder automatisch gesetzt. Bitte erneut bestätigen.",
  anchorEditActive:
    "Ankerbearbeitung aktiv. Ziehe Start und Ende direkt auf der hellen Kontur.",
  anchorEditCancelled: "Ankerbearbeitung verworfen.",
  anchorsApplied: "Start und Ende übernommen. Rib-Profil, 3D-Vorschau und STL sind aktualisiert.",
  anchorsConfirmed: "Start und Ende bestätigt. Jetzt kannst du das Rib fein einstellen.",
  dropImagePrompt: "Bitte ein Bild per Drag-and-Drop hineinziehen.",
  downloadNeedsContour: "Zuerst eine Kontur erkennen, dann STL exportieren.",
  geometryNotExportable: "Die Rib-Geometrie ist noch nicht exportierbar.",
  stlExported: "STL exportiert.",
  diagnosticsCopied: "Diagnose in die Zwischenablage kopiert.",
  diagnosticsCopyFailed: "Diagnose konnte nicht kopiert werden.",
  diagnosticsDownloaded: "Diagnose als JSON exportiert.",
  contourHint: "Ins Gefäß klicken",
  dropzoneHint: 'Foto hier hineinziehen oder oben auf "Foto" klicken',
  previewEmpty: "Kontur folgt nach Klick ins Gefäß",
  anchorApplyLabel: "Übernehmen",
  anchorResetLabel: "Zurücksetzen",
} as const;

export const getLoadedImageStatus = (fileName: string, extremeRatio: boolean) =>
  extremeRatio
    ? `"${fileName}" geladen. Format ist speziell. Aktiviere Schritt 1 und setze dann den Marker.`
    : `"${fileName}" geladen. Starte jetzt mit Schritt 1 und setze den Marker im Gefäß.`;

export const getContourReadyStatus = (
  usableColumns: number,
  side: WorkProfileSide,
  anchorsConfirmed: boolean,
) =>
  anchorsConfirmed
    ? `Bereit - ${usableColumns} Messpunkte, ${side === "left" ? "links" : "rechts"}.`
    : "Kontur erkannt - aktuelle Seite ist aktiv. Bei Bedarf wechseln oder Start/Ende direkt ziehen.";

export const getSideSelectedStatus = (side: WorkProfileSide) =>
  `Seite ${side === "left" ? "links" : "rechts"} gewählt - Start/Ende-Punkte ziehen zum Anpassen, oder direkt STL herunterladen.`;

export const getDraggingAnchorStatus = (handle: "top" | "bottom") =>
  `${handle === "top" ? "Start" : "Ende"} verschieben...`;

export const getResetSelectionStatus = (hasSourceRaster: boolean) =>
  hasSourceRaster ? "Zurückgesetzt. Klicke erneut ins Gefäß." : pageText.initialStatus;

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
    return "Schritt 1: Marker setzen und bestätigen";
  }

  if (!currentAnchorsConfirmed || anchorEditMode) {
    return "Schritt 3: Start und Ende prüfen";
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
    return "Bearbeitung aktiv - Marker auf der Kontur ziehen, dann Übernehmen.";
  }

  if (!hasSourceRaster) {
    return "Foto hochladen und ins Gefäß klicken - danach links oder rechts wählen.";
  }

  if (!hasPromptPoint) {
    return "Direkt ins Gefäß klicken um die Kontur zu erkennen.";
  }

  if (!currentAnchorsConfirmed) {
    return "Links oder rechts im Foto wählen um das Profil zu aktivieren.";
  }

  return "Einstellungen anpassen, dann STL herunterladen.";
};
