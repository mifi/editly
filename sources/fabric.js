import { fabric } from 'fabric';
import { createCanvas, ImageData } from 'canvas';

import { boxBlurImage } from '../BoxBlur.js';

// Fabric is used as a fundament for compositing layers in editly

export function canvasToRgba(ctx) {
  // const bgra = canvas.toBuffer('raw');

  /* const rgba = Buffer.allocUnsafe(bgra.length);
  for (let i = 0; i < bgra.length; i += 4) {
    rgba[i + 0] = bgra[i + 2];
    rgba[i + 1] = bgra[i + 1];
    rgba[i + 2] = bgra[i + 0];
    rgba[i + 3] = bgra[i + 3];
  } */

  // We cannot use toBuffer('raw') because it returns pre-multiplied alpha data (a different format)
  // https://gamedev.stackexchange.com/questions/138813/whats-the-difference-between-alpha-and-premulalpha
  // https://github.com/Automattic/node-canvas#image-pixel-formats-experimental
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  return Buffer.from(imageData.data);
}

export function getNodeCanvasFromFabricCanvas(fabricCanvas) {
  // https://github.com/fabricjs/fabric.js/blob/26e1a5b55cbeeffb59845337ced3f3f91d533d7d/src/static_canvas.class.js
  // https://github.com/fabricjs/fabric.js/issues/3885
  return fabric.util.getNodeCanvas(fabricCanvas.lowerCanvasEl);
}

export function fabricCanvasToRgba(fabricCanvas) {
  const internalCanvas = getNodeCanvasFromFabricCanvas(fabricCanvas);
  const ctx = internalCanvas.getContext('2d');

  // require('fs').writeFileSync(`${Math.floor(Math.random() * 1e12)}.png`, internalCanvas.toBuffer('image/png'));
  // throw new Error('abort');

  return canvasToRgba(ctx);
}

export function createFabricCanvas({ width, height }) {
  return new fabric.StaticCanvas(null, { width, height });
}

export async function renderFabricCanvas(canvas, clear = true) {
  // console.time('canvas.renderAll');
  canvas.renderAll();
  // console.timeEnd('canvas.renderAll');
  const rgba = fabricCanvasToRgba(canvas);
  if (clear) {
    canvas.clear();
    canvas.dispose();
  }
  return rgba;
}

export function toUint8ClampedArray(buffer) {
  // return Uint8ClampedArray.from(buffer);
  // Some people are finding that manual copying is orders of magnitude faster than Uint8ClampedArray.from
  // Since I'm getting similar times for both methods, then why not:
  const data = new Uint8ClampedArray(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) {
    data[i] = buffer[i];
  }
  return data;
}

export function fabricCanvasToFabricImage(fabricCanvas) {
  const canvas = getNodeCanvasFromFabricCanvas(fabricCanvas);
  return new fabric.Image(canvas);
}

export async function rgbaToFabricImage({ width, height, rgba }) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  // https://developer.mozilla.org/en-US/docs/Web/API/ImageData/ImageData
  // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/putImageData
  ctx.putImageData(new ImageData(toUint8ClampedArray(rgba), width, height), 0, 0);
  // https://stackoverflow.com/questions/58209996/unable-to-render-tiff-images-and-add-it-as-a-fabric-object
  return new fabric.Image(canvas);
}

export async function createFabricFrameSource(func, { width, height, ...rest }) {
  const onInit = async () => func(({ width, height, fabric, ...rest }));

  const { onRender = () => {}, onClose = () => {} } = await onInit() || {};

  return {
    readNextFrame: onRender,
    close: onClose,
  };
}

export async function createCustomCanvasFrameSource({ width, height, params }) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');

  const { onClose, onRender } = await params.func(({ width, height, canvas }));

  async function readNextFrame(progress) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    await onRender(progress);
    // require('fs').writeFileSync(`${new Date().getTime()}.png`, canvas.toBuffer('image/png'));
    // I don't know any way to draw a node-canvas as a layer on a fabric.js canvas, other than converting to rgba first:
    return canvasToRgba(context);
  }

  return {
    readNextFrame,
    // Node canvas needs no cleanup https://github.com/Automattic/node-canvas/issues/1216#issuecomment-412390668
    close: onClose,
  };
}

export function registerFont(...args) {
  fabric.nodeCanvas.registerFont(...args);
}

export async function blurImage({ mutableImg, width, height }) {
  mutableImg.setOptions({ scaleX: width / mutableImg.width, scaleY: height / mutableImg.height });

  const fabricCanvas = createFabricCanvas({ width, height });
  fabricCanvas.add(mutableImg);
  fabricCanvas.renderAll();

  const internalCanvas = getNodeCanvasFromFabricCanvas(fabricCanvas);
  const ctx = internalCanvas.getContext('2d');

  const blurAmount = Math.min(100, Math.max(width, height) / 10); // More than 100 seems to cause issues
  const passes = 1;
  boxBlurImage(ctx, width, height, blurAmount, false, passes);

  return new fabric.Image(internalCanvas);
}
