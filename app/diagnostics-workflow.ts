"use client";

import { triggerBrowserDownload } from "./browser-download";

const serializeDiagnosticsSnapshot = (snapshot: unknown) =>
  JSON.stringify(snapshot, null, 2);

export const copyDiagnosticsSnapshot = async (snapshot: unknown) => {
  await navigator.clipboard.writeText(serializeDiagnosticsSnapshot(snapshot));
};

export const downloadDiagnosticsSnapshot = (snapshot: unknown) => {
  const blob = new Blob([serializeDiagnosticsSnapshot(snapshot)], {
    type: "application/json",
  });

  triggerBrowserDownload({
    attachToBody: true,
    blob,
    fileName: "rib-diagnose.json",
  });
};
