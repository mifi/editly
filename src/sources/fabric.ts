import { type CanvasRenderingContext2D, createCanvas, ImageData } from "canvas";
import * as fabric from "fabric/node";
import { boxBlurImage } from "../BoxBlur.js";
import { defineFrameSource } from "../api/index.js";
import type { FabricLayer } from "../types.js";

// Fabric is used as a fundament for compositing layers in editly

export function canvasToRgba(ctx: CanvasRenderingContext2D) {
  // We cannot use toBuffer('raw') because it returns pre-multiplied alpha data (a different format)
  // https://gamedev.stackexchange.com/questions/138813/whats-the-difference-between-alpha-and-premulalpha
  // https://github.com/Automattic/node-canvas#image-pixel-formats-experimental
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  return Buffer.from(imageData.data);
}

export function fabricCanvasToRgba(fabricCanvas: fabric.StaticCanvas) {
  const internalCanvas = fabricCanvas.getNodeCanvas();
  const ctx = internalCanvas.getContext("2d");

  return canvasToRgba(ctx);
}

export function createFabricCanvas({ width, height }: { width: number; height: number }) {
  return new fabric.StaticCanvas(null, { width, height });
}

export async function renderFabricCanvas(canvas: fabric.StaticCanvas) {
  // console.time('canvas.renderAll');
  canvas.renderAll();
  // console.timeEnd('canvas.renderAll');
  const rgba = fabricCanvasToRgba(canvas);
  canvas.clear();
  canvas.dispose();
  return rgba;
}

export function toUint8ClampedArray(buffer: Buffer) {
  // return Uint8ClampedArray.from(buffer);
  // Some people are finding that manual copying is orders of magnitude faster than Uint8ClampedArray.from
  // Since I'm getting similar times for both methods, then why not:
  const data = new Uint8ClampedArray(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) {
    data[i] = buffer[i];
  }
  return data;
}

export async function rgbaToFabricImage({
  width,
  height,
  rgba,
}: {
  width: number;
  height: number;
  rgba: Buffer;
}) {
  const canvas = createCanvas(width, height);

  // FIXME: Fabric tries to add a class to this, but DOM is not defined. Because node?
  // https://github.com/fabricjs/fabric.js/issues/10032
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (canvas as any).classList = new Set();

  const ctx = canvas.getContext("2d");
  // https://developer.mozilla.org/en-US/docs/Web/API/ImageData/ImageData
  // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/putImageData
  ctx.putImageData(new ImageData(toUint8ClampedArray(rgba), width, height), 0, 0);
  // https://stackoverflow.com/questions/58209996/unable-to-render-tiff-images-and-add-it-as-a-fabric-object
  return new fabric.FabricImage(canvas);
}

export type BlurImageOptions = {
  mutableImg: fabric.FabricImage;
  width: number;
  height: number;
};

export async function blurImage({ mutableImg, width, height }: BlurImageOptions) {
  mutableImg.set({ scaleX: width / mutableImg.width, scaleY: height / mutableImg.height });

  const canvas = mutableImg.toCanvasElement();
  const ctx = canvas.getContext("2d");

  const blurAmount = Math.min(100, Math.max(width, height) / 10); // More than 100 seems to cause issues
  const passes = 1;
  boxBlurImage(ctx, width, height, blurAmount, false, passes);

  return new fabric.FabricImage(canvas);
} // http://fabricjs.com/kitchensink

export default defineFrameSource<FabricLayer>("fabric", async ({ width, height, params }) => {
  const { onRender, onClose } = await params.func({ width, height, fabric, params });

  return {
    readNextFrame: onRender,
    close: onClose,
  };
});
