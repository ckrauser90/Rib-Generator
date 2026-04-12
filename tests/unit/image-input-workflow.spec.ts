import { expect, test } from "@playwright/test";
import {
  findFirstImageFile,
  isExtremeAspectRatio,
  prepareImageUpload,
} from "../../app/image-input-workflow";

test("isExtremeAspectRatio detects both very wide and very tall images", () => {
  expect(isExtremeAspectRatio(1600, 400, 3.2)).toBe(true);
  expect(isExtremeAspectRatio(400, 1600, 3.2)).toBe(true);
  expect(isExtremeAspectRatio(1200, 900, 3.2)).toBe(false);
});

test("findFirstImageFile returns the first image file and skips non-image files", () => {
  const files = [
    new File(["hello"], "notes.txt", { type: "text/plain" }),
    new File(["a"], "cup.png", { type: "image/png" }),
    new File(["b"], "cup-2.jpg", { type: "image/jpeg" }),
  ];

  expect(findFirstImageFile(files)?.name).toBe("cup.png");
  expect(findFirstImageFile([new File(["hello"], "notes.txt", { type: "text/plain" })])).toBeNull();
});

test("prepareImageUpload resets the segmenter and revokes only prior blob urls", async () => {
  const revoked: string[] = [];
  const statuses: Array<{ fileName: string; extreme: boolean }> = [];
  let resetCount = 0;

  const upload = await prepareImageUpload({
    createObjectUrl: () => "blob:new-image",
    file: new File(["png"], "cup.png", { type: "image/png" }),
    getLoadedImageStatus: (fileName, extreme) => {
      statuses.push({ fileName, extreme });
      return extreme ? "extreme" : "normal";
    },
    loadImageFromUrl: async () => ({
      naturalWidth: 1200,
      naturalHeight: 900,
      width: 1200,
      height: 900,
    }),
    maxAspectRatio: 3.2,
    previousImageUrl: "blob:old-image",
    resetSegmenter: () => {
      resetCount += 1;
    },
    revokeObjectUrl: (url) => {
      revoked.push(url);
    },
  });

  expect(upload).toEqual({
    image: {
      naturalWidth: 1200,
      naturalHeight: 900,
      width: 1200,
      height: 900,
    },
    status: "normal",
    url: "blob:new-image",
  });
  expect(resetCount).toBe(1);
  expect(revoked).toEqual(["blob:old-image"]);
  expect(statuses).toEqual([{ fileName: "cup.png", extreme: false }]);
});

test("prepareImageUpload marks extreme aspect uploads and leaves non-blob urls untouched", async () => {
  const revoked: string[] = [];

  const upload = await prepareImageUpload({
    createObjectUrl: () => "blob:wide-image",
    file: new File(["png"], "panorama.png", { type: "image/png" }),
    getLoadedImageStatus: (_fileName, extreme) => (extreme ? "extreme" : "normal"),
    loadImageFromUrl: async () => ({
      naturalWidth: 2000,
      naturalHeight: 500,
      width: 2000,
      height: 500,
    }),
    maxAspectRatio: 3.2,
    previousImageUrl: "https://example.com/previous.png",
    resetSegmenter: () => undefined,
    revokeObjectUrl: (url) => {
      revoked.push(url);
    },
  });

  expect(upload.status).toBe("extreme");
  expect(revoked).toEqual([]);
});
