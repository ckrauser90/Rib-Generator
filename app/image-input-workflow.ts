type LoadImageResult = Pick<
  HTMLImageElement,
  "naturalWidth" | "naturalHeight" | "width" | "height"
>;

type PrepareImageUploadOptions<TImage extends LoadImageResult> = {
  createObjectUrl: (file: File) => string;
  file: File;
  getLoadedImageStatus: (fileName: string, extremeRatio: boolean) => string;
  loadImageFromUrl: (url: string) => Promise<TImage>;
  maxAspectRatio: number;
  previousImageUrl: string | null;
  resetSegmenter: () => void;
  revokeObjectUrl: (url: string) => void;
};

export type PreparedImageUpload<TImage extends LoadImageResult> = {
  image: TImage;
  status: string;
  url: string;
};

export const isExtremeAspectRatio = (width: number, height: number, maxAspectRatio: number) => {
  const ratio = width / Math.max(1, height);
  return ratio >= maxAspectRatio || ratio <= 1 / maxAspectRatio;
};

export const findFirstImageFile = (files: Iterable<File>) => {
  for (const file of files) {
    if (file.type.startsWith("image/")) {
      return file;
    }
  }

  return null;
};

export const prepareImageUpload = async <TImage extends LoadImageResult>({
  createObjectUrl,
  file,
  getLoadedImageStatus,
  loadImageFromUrl,
  maxAspectRatio,
  previousImageUrl,
  resetSegmenter,
  revokeObjectUrl,
}: PrepareImageUploadOptions<TImage>): Promise<PreparedImageUpload<TImage>> => {
  if (previousImageUrl?.startsWith("blob:")) {
    revokeObjectUrl(previousImageUrl);
  }

  resetSegmenter();
  const url = createObjectUrl(file);
  const image = await loadImageFromUrl(url);
  const extremeRatio = isExtremeAspectRatio(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    maxAspectRatio,
  );

  return {
    image,
    status: getLoadedImageStatus(file.name, extremeRatio),
    url,
  };
};
