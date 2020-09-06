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

function createFabricCanvas({ width, height }) {
  return new fabric.StaticCanvas(null, { width, height });
}

async function renderFabricCanvas(canvas) {
  canvas.renderAll();
  const rgba = fabricCanvasToRgba(canvas);
  canvas.clear();
  // canvas.dispose();
  return rgba;
}

async function rgbaToFabricImage({ width, height, rgba }) {
  const canvas = createCanvas(width, height);
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

async function imageFrameSource({ verbose, params, width, height }) {
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


  async function onRender(progress, canvas) {
    const { zoomDirection = 'in', zoomAmount = 0.1 } = params;

    const img = getImg();

    let scaleFactor = 1;
    if (zoomDirection === 'in') scaleFactor = (1 + progress * zoomAmount);
    else if (zoomDirection === 'out') scaleFactor = (1 + zoomAmount * (1 - progress));

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

async function fillColorFrameSource({ params, width, height }) {
  const { color } = params;

  const randomColor = getRandomColors(1)[0];

  async function onRender(progress, canvas) {
    const rect = new fabric.Rect({
      left: 0,
      right: 0,
      width,
      height,
      fill: color || randomColor,
    });
    canvas.add(rect);
  }

  return { onRender };
}

function getRekt(width, height) {
  // width and height with room to rotate
  return new fabric.Rect({ originX: 'center', originY: 'center', left: width / 2, top: height / 2, width: width * 2, height: height * 2 });
}

async function radialGradientFrameSource({ width, height, params }) {
  const { colors: inColors } = params;

  const randomColors = getRandomGradient();

  async function onRender(progress, canvas) {
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

async function linearGradientFrameSource({ width, height, params }) {
  const { colors: inColors } = params;

  const randomColors = getRandomGradient();
  const colors = inColors && inColors.length === 2 ? inColors : randomColors;

  async function onRender(progress, canvas) {
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

async function subtitleFrameSource({ width, height, params }) {
  const { text, textColor = '#ffffff', backgroundColor = 'rgba(0,0,0,0.3)', fontFamily = 'sans-serif', delay = 0, speed = 1 } = params;

  async function onRender(progress, canvas) {
    const easedProgress = easeOutExpo(Math.max(0, Math.min((progress - delay) * speed, 1)));

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
      fill: backgroundColor,
      opacity: easedProgress,
    });

    canvas.add(rect);
    canvas.add(textBox);
  }

  return { onRender };
}

function getPositionProps({ position, width, height, objHeight }) {
  let originY = 'center';
  let originX = 'center';
  let top = height / 2;
  let left = width / 2;

  if (position === 'top') {
    originY = 'top';
    top = height * objHeight;
  } else if (position === 'bottom') {
    originY = 'bottom';
    top = height;
  }

  if (position.x != null) {
    originX = position.originX || 'left';
    left = width * position.x;
  }
  if (position.y != null) {
    originY = position.originY || 'top';
    top = height * position.y;
  }

  return { originX, originY, top, left };
}

async function titleFrameSource({ width, height, params }) {
  const { text, textColor = '#ffffff', fontFamily = 'sans-serif', position = 'center' } = params;

  async function onRender(progress, canvas) {
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

    // We need the text as an image in order to scale it
    const textImage = await new Promise((r) => textBox.cloneAsImage(r));

    const { left, top, originX, originY } = getPositionProps({ position, width, height, objHeight: 0.05 });

    textImage.set({
      originX,
      originY,
      left,
      top,
      scaleX: scale,
      scaleY: scale,
    });
    canvas.add(textImage);
  }

  return { onRender };
}

async function newsTitleFrameSource({ width, height, params }) {
  const { text, textColor = '#ffffff', backgroundColor = '#d02a42', fontFamily = 'sans-serif', delay = 0, speed = 1 } = params;

  async function onRender(progress, canvas) {
    const min = Math.min(width, height);

    const fontSize = Math.round(min * 0.05);

    const easedBgProgress = easeOutExpo(Math.max(0, Math.min((progress - delay) * speed * 3, 1)));
    const easedTextProgress = easeOutExpo(Math.max(0, Math.min((progress - delay - 0.02) * speed * 4, 1)));
    const easedTextOpacityProgress = easeOutExpo(Math.max(0, Math.min((progress - delay - 0.07) * speed * 4, 1)));

    const top = height * 0.08;

    const paddingV = 0.07 * min;
    const paddingH = 0.03 * min;

    const textBox = new fabric.Text(text, {
      top,
      left: paddingV + (easedTextProgress - 1) * width,
      fill: textColor,
      opacity: easedTextOpacityProgress,
      fontFamily,
      fontSize,
      charSpacing: width * 0.1,
    });

    const bgWidth = textBox.width + (paddingV * 2);
    const rect = new fabric.Rect({
      top: top - paddingH,
      left: (easedBgProgress - 1) * bgWidth,
      width: bgWidth,
      height: textBox.height + (paddingH * 2),
      fill: backgroundColor,
    });

    canvas.add(rect);
    canvas.add(textBox);
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
    // I don't know any way to draw a node-canvas as a layer on a fabric.js canvas, other than converting to rgba first:
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
  registerFont,
  createFabricFrameSource,
  createCustomCanvasFrameSource,

  customFabricFrameSource,
  subtitleFrameSource,
  titleFrameSource,
  newsTitleFrameSource,
  fillColorFrameSource,
  radialGradientFrameSource,
  linearGradientFrameSource,
  imageFrameSource,

  createFabricCanvas,
  renderFabricCanvas,
  rgbaToFabricImage,
};
