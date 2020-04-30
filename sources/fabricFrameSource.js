const { fabric } = require('fabric');
const fileUrl = require('file-url');
const nodeCanvas = require('canvas');

const { createCanvas } = nodeCanvas;

const { canvasToRgba } = require('./shared');
const { getRandomGradient, getRandomColors } = require('../colors');
const { easeOutExpo } = require('../transitions');

// http://fabricjs.com/kitchensink


function fabricCanvasToRgba(canvas) {
  // https://github.com/fabricjs/fabric.js/blob/26e1a5b55cbeeffb59845337ced3f3f91d533d7d/src/static_canvas.class.js
  // https://github.com/fabricjs/fabric.js/issues/3885
  const internalCanvas = fabric.util.getNodeCanvas(canvas.lowerCanvasEl);
  const ctx = internalCanvas.getContext('2d');

  // require('fs').writeFileSync(`${Math.floor(Math.random() * 1e12)}.png`, internalCanvas.toBuffer('image/png'));
  // throw new Error('abort');

  return canvasToRgba(ctx);
}

async function mergeFrames({ width, height, framesRaw }) {
  if (framesRaw.length === 1) return framesRaw[0];

  // Node canvas needs no cleanup https://github.com/Automattic/node-canvas/issues/1216#issuecomment-412390668
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  framesRaw.forEach((frameRaw) => {
    const canvas2 = createCanvas(width, height);
    const ctx2 = canvas2.getContext('2d');
    // https://developer.mozilla.org/en-US/docs/Web/API/ImageData/ImageData
    // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/putImageData
    ctx2.putImageData(new nodeCanvas.ImageData(Uint8ClampedArray.from(frameRaw), width, height), 0, 0);
    // require('fs').writeFileSync(`${Math.floor(Math.random() * 1e12)}.png`, canvas2.toBuffer('image/png'));

    ctx.drawImage(canvas2, 0, 0);
  });

  return canvasToRgba(ctx);
}

async function createFabricFrameSource(func, { width, height, ...rest }) {
  const onInit = async ({ canvas }) => func(({ width, height, fabric, canvas, ...rest }));

  let canvas = new fabric.StaticCanvas(null, { width, height });

  const { onRender = () => {}, onClose = () => {} } = await onInit({ canvas }) || {};

  async function readNextFrame(progress) {
    await onRender(progress);

    canvas.renderAll();

    const rgba = fabricCanvasToRgba(canvas);

    canvas.clear();
    // canvas.dispose();
    return rgba;
  }

  return {
    readNextFrame,
    close: () => {
      // https://stackoverflow.com/questions/19030174/how-to-manage-memory-in-case-of-multiple-fabric-js-canvas
      canvas.dispose();
      canvas = undefined;
      onClose();
    },
  };
}

async function imageFrameSource({ verbose, params, width, height, canvas }) {
  if (verbose) console.log('Loading', params.path);

  const imgData = await new Promise((resolve) => fabric.util.loadImage(fileUrl(params.path), resolve));

  const getImg = () => new fabric.Image(imgData, {
    originX: 'center',
    originY: 'center',
    left: width / 2,
    top: height / 2,
  });

  // Blurred version
  const blurredImg = getImg();
  blurredImg.filters = [new fabric.Image.filters.Resize({ scaleX: 0.01, scaleY: 0.01 })];
  blurredImg.applyFilters();

  if (blurredImg.height > blurredImg.width) blurredImg.scaleToWidth(width);
  else blurredImg.scaleToHeight(height);

  const defaultScaleFactor = 1;
  const scaleFns = {
    in: (progress, zoomAmount = 0.1) => 1 + progress * zoomAmount,
    out: (progress, zoomAmount = 0.1) => 1 + zoomAmount * (1 - progress),
  };

  async function onRender(progress) {
    const { zoomDirection, zoomAmount } = params;

    const img = getImg();

    let scaleFactor;
    if (scaleFns[zoomDirection]) {
      scaleFactor = scaleFns[zoomDirection](progress, zoomAmount);
    } else {
      scaleFactor = defaultScaleFactor;
    }

    if (img.height > img.width) img.scaleToHeight(height * scaleFactor);
    else img.scaleToWidth(width * scaleFactor);

    canvas.add(blurredImg);
    canvas.add(img);
  }

  function onClose() {
    blurredImg.dispose();
    // imgData.dispose();
  }

  return { onRender, onClose };
}

async function fillColorFrameSource({ canvas, params }) {
  const { color } = params;

  const randomColor = getRandomColors(1)[0];

  async function onRender() {
    // eslint-disable-next-line no-param-reassign
    canvas.backgroundColor = color || randomColor;
  }

  return { onRender };
}

function getRekt(width, height) {
  // width and height with room to rotate
  return new fabric.Rect({ originX: 'center', originY: 'center', left: width / 2, top: height / 2, width: width * 2, height: height * 2 });
}

async function radialGradientFrameSource({ canvas, width, height, params }) {
  const { colors: inColors } = params;

  const randomColors = getRandomGradient();

  async function onRender(progress) {
    // console.log('progress', progress);

    const max = Math.max(width, height);

    const colors = inColors && inColors.length === 2 ? inColors : randomColors;

    const r1 = 0;
    const r2 = max * (1 + progress) * 0.6;

    const rect = getRekt(width, height);

    const cx = 0.5 * rect.width;
    const cy = 0.5 * rect.height;

    rect.setGradient('fill', {
      type: 'radial',
      r1,
      r2,
      x1: cx,
      y1: cy,
      x2: cx,
      y2: cy,
      colorStops: {
        0: colors[0],
        1: colors[1],
      },
    });

    canvas.add(rect);
  }

  return { onRender };
}

async function linearGradientFrameSource({ canvas, width, height, params }) {
  const { colors: inColors } = params;

  const randomColors = getRandomGradient();
  const colors = inColors && inColors.length === 2 ? inColors : randomColors;

  async function onRender(progress) {
    const rect = getRekt(width, height);

    rect.setGradient('fill', {
      x1: 0,
      y1: 0,
      x2: width,
      y2: height,
      colorStops: {
        0: colors[0],
        1: colors[1],
      },
    });

    rect.rotate(progress * 30);
    canvas.add(rect);
  }

  return { onRender };
}

async function subtitleFrameSource({ canvas, width, height, params }) {
  const { text, textColor = '#ffffff', fontFamily = 'sans-serif' } = params;

  async function onRender(progress) {
    const easedProgress = easeOutExpo(Math.min(progress, 1));

    const min = Math.min(width, height);
    const padding = 0.05 * min;

    const textBox = new fabric.Textbox(text, {
      fill: textColor,
      fontFamily,

      fontSize: min / 20,
      textAlign: 'left',
      width: width - padding * 2,
      originX: 'center',
      originY: 'bottom',
      left: (width / 2) + (-1 + easedProgress) * padding,
      top: height - padding,
      opacity: easedProgress,
    });

    const rect = new fabric.Rect({
      left: 0,
      width,
      height: textBox.height + padding * 2,
      top: height,
      originY: 'bottom',
      fill: 'rgba(0,0,0,0.2)',
      opacity: easedProgress,
    });

    canvas.add(rect);
    canvas.add(textBox);
  }

  return { onRender };
}

async function titleFrameSource({ canvas, width, height, params }) {
  const { text, textColor = '#ffffff', fontFamily = 'sans-serif', position = 'center' } = params;

  async function onRender(progress) {
    // console.log('progress', progress);

    const min = Math.min(width, height);

    const fontSize = Math.round(min * 0.1);

    const scale = (1 + progress * 0.2).toFixed(4);

    const textBox = new fabric.Textbox(text, {
      fill: textColor,
      fontFamily,
      fontSize,
      textAlign: 'center',
      width: width * 0.8,
    });

    const textImage = await new Promise((r) => textBox.cloneAsImage(r));

    let originY = 'center';
    let top = height / 2;
    if (position === 'top') {
      originY = 'top';
      top = height * 0.05;
    } else if (position === 'bottom') {
      originY = 'bottom';
      top = height;
    }

    textImage.set({
      originX: 'center',
      originY,
      left: width / 2,
      top,
      scaleX: scale,
      scaleY: scale,
    });
    canvas.add(textImage);
  }

  return { onRender };
}

async function createCustomCanvasFrameSource({ width, height, params }) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');

  const { onClose, onRender } = await params.func(({ width, height, canvas }));

  async function readNextFrame(progress) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    await onRender(progress);
    // require('fs').writeFileSync(`${new Date().getTime()}.png`, canvas.toBuffer('image/png'));
    return canvasToRgba(context);
  }

  return {
    readNextFrame,
    // Node canvas needs no cleanup https://github.com/Automattic/node-canvas/issues/1216#issuecomment-412390668
    close: onClose,
  };
}

async function customFabricFrameSource({ canvas, width, height, params }) {
  return params.func(({ width, height, fabric, canvas }));
}

function registerFont(...args) {
  fabric.nodeCanvas.registerFont(...args);
}

module.exports = {
  mergeFrames,
  registerFont,
  createFabricFrameSource,
  createCustomCanvasFrameSource,

  customFabricFrameSource,
  subtitleFrameSource,
  titleFrameSource,
  fillColorFrameSource,
  radialGradientFrameSource,
  linearGradientFrameSource,
  imageFrameSource,
};
