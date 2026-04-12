"use client";

type TriggerBrowserDownloadOptions = {
  attachToBody?: boolean;
  blob: Blob;
  fileName: string;
};

export const triggerBrowserDownload = ({
  attachToBody = false,
  blob,
  fileName,
}: TriggerBrowserDownloadOptions) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;

  if (attachToBody) {
    document.body.appendChild(link);
  }

  link.click();

  if (attachToBody) {
    document.body.removeChild(link);
  }

  URL.revokeObjectURL(url);
};
