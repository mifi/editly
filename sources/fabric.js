const { fabric } = require('fabric');
const nodeCanvas = require('canvas');

const { canvasToRgba } = require('./shared');


// Fabric is used as a fundament for compositing layers in editly

function fabricCanvasToRgba(canvas) {
  // https://github.com/fabricjs/fabric.js/blob/26e1a5b55cbeeffb59845337ced3f3f91d533d7d/src/static_canvas.class.js
  // https://github.com/fabricjs/fabric.js/issues/3885
  const internalCanvas = fabric.util.getNodeCanvas(canvas.lowerCanvasEl);
  const ctx = internalCanvas.getContext('2d');

  // require('fs').writeFileSync(`${Math.floor(Math.random() * 1e12)}.png`, internalCanvas.toBuffer('image/png'));
  // throw new Error('abort');

  return canvasToRgba(ctx);
}

function createFabricCanvas({ width, height }) {
  return new fabric.StaticCanvas(null, { width, height });
}

async function renderFabricCanvas(canvas) {
  canvas.renderAll();
  const rgba = fabricCanvasToRgba(canvas);
  canvas.clear();
  canvas.dispose();
  return rgba;
}

async function rgbaToFabricImage({ width, height, rgba }) {
  const canvas = nodeCanvas.createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  // https://developer.mozilla.org/en-US/docs/Web/API/ImageData/ImageData
  // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/putImageData
  ctx.putImageData(new nodeCanvas.ImageData(Uint8ClampedArray.from(rgba), width, height), 0, 0);
  // https://stackoverflow.com/questions/58209996/unable-to-render-tiff-images-and-add-it-as-a-fabric-object
  return new fabric.Image(canvas);
}

async function createFabricFrameSource(func, { width, height, ...rest }) {
  const onInit = async () => func(({ width, height, fabric, ...rest }));

  const { onRender = () => {}, onClose = () => {} } = await onInit() || {};

  return {
    readNextFrame: onRender,
    close: onClose,
  };
}

async function createCustomCanvasFrameSource({ width, height, params }) {
  const canvas = nodeCanvas.createCanvas(width, height);
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

function registerFont(...args) {
  fabric.nodeCanvas.registerFont(...args);
}

module.exports = {
  registerFont,
  createFabricFrameSource,
  createCustomCanvasFrameSource,

  createFabricCanvas,
  renderFabricCanvas,
  rgbaToFabricImage,
};
