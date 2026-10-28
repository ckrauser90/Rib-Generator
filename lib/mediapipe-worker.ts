import { createSegmenter, segmentWithOwnedMask, type SegmenterAssets } from "./mediapipe-core";

export type WorkerRequest = {
  id: number;
  assets: SegmenterAssets;
  image?: ImageBitmap;
  point?: { x: number; y: number };
  cutoff?: number;
};

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
let instance: Awaited<ReturnType<typeof createSegmenter>> | null = null;
// Initialization is asynchronous, but MediaPipe graphs must receive frames serially.
let pending = Promise.resolve();
scope.onmessage = ({ data }) => {
  pending = pending.then(async () => {
    try {
      instance ??= await createSegmenter(data.assets, new OffscreenCanvas(1, 1));
      if (!data.image) {
        scope.postMessage({ id: data.id });
        return;
      }
      const mask = segmentWithOwnedMask(instance, data.image, data.point!, data.cutoff!);
      scope.postMessage({ id: data.id, mask }, [mask.confidence.buffer, mask.binaryMask.buffer]);
    } catch (error) {
      scope.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
    } finally {
      data.image?.close();
    }
  });
};
