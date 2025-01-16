import * as fabric from 'fabric/node';

import { getRandomGradient, getRandomColors } from '../../colors.js';
import { easeOutExpo, easeInOutCubic } from '../../transitions.js';
import { getFrameByKeyFrames, getPositionProps, loadImage } from '../../util.js';
import { type FabricFrameSourceOptions } from '../fabric.js';
import type { FabricLayer, FillColorLayer, ImageOverlayLayer, KenBurns, LinearGradientLayer, NewsTitleLayer, RadialGradientLayer, SlideInTextLayer, SubtitleLayer, TitleLayer } from '../../types.js';

// http://fabricjs.com/kitchensink

const defaultFontFamily = 'sans-serif';

export function getZoomParams({ progress, zoomDirection, zoomAmount = 0.1 }: KenBurns & { progress: number }) {
  let scaleFactor = 1;
  if (zoomDirection === 'left' || zoomDirection === 'right') return 1.3 + zoomAmount;
  if (zoomDirection === 'in') scaleFactor = (1 + zoomAmount * progress);
  else if (zoomDirection === 'out') scaleFactor = (1 + zoomAmount * (1 - progress));
  return scaleFactor;
}

export function getTranslationParams({ progress, zoomDirection, zoomAmount = 0.1 }: KenBurns & { progress: number }) {
  let translation = 0;
  const range = zoomAmount * 1000;

  if (zoomDirection === 'right') translation = (progress) * range - range / 2;
  else if (zoomDirection === 'left') translation = -((progress) * range - range / 2);

  return translation;
}

export async function fillColorFrameSource({ params, width, height }: FabricFrameSourceOptions<FillColorLayer>) {
  const { color } = params;

  const randomColor = getRandomColors(1)[0];

  async function onRender(_: number, canvas: fabric.StaticCanvas) {
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

function getRekt(width: number, height: number) {
  // width and height with room to rotate
  return new fabric.Rect({ originX: 'center', originY: 'center', left: width / 2, top: height / 2, width: width * 2, height: height * 2 });
}

export async function radialGradientFrameSource({ width, height, params }: FabricFrameSourceOptions<RadialGradientLayer>) {
  const { colors: inColors } = params;

  const randomColors = getRandomGradient();

  async function onRender(progress: number, canvas: fabric.StaticCanvas) {
    // console.log('progress', progress);

    const max = Math.max(width, height);

    const colors = inColors && inColors.length === 2 ? inColors : randomColors;

    const r1 = 0;
    const r2 = max * (1 + progress) * 0.6;

    const rect = getRekt(width, height);

    const cx = 0.5 * rect.width;
    const cy = 0.5 * rect.height;

    rect.set('fill', new fabric.Gradient({
      type: 'radial',
      coords: {
        r1,
        r2,
        x1: cx,
        y1: cy,
        x2: cx,
        y2: cy,
      },
      colorStops: [
        { offset: 0, color: colors[0] },
        { offset: 1, color: colors[1] },
      ],
    }));

    canvas.add(rect);
  }

  return { onRender };
}

export async function linearGradientFrameSource({ width, height, params }: FabricFrameSourceOptions<LinearGradientLayer>) {
  const { colors: inColors } = params;

  const randomColors = getRandomGradient();
  const colors = inColors && inColors.length === 2 ? inColors : randomColors;

  async function onRender(progress: number, canvas: fabric.StaticCanvas) {
    const rect = getRekt(width, height);

    rect.set('fill', new fabric.Gradient({
      coords: {
        x1: 0,
        y1: 0,
        x2: width,
        y2: height,
      },
      colorStops: [
        { offset: 0, color: colors[0] },
        { offset: 1, color: colors[1] },
      ],
    }));

    rect.rotate(progress * 30);
    canvas.add(rect);
  }

  return { onRender };
}

export async function subtitleFrameSource({ width, height, params }: FabricFrameSourceOptions<SubtitleLayer>) {
  const { text, textColor = '#ffffff', backgroundColor = 'rgba(0,0,0,0.3)', fontFamily = defaultFontFamily, delay = 0, speed = 1 } = params;
  async function onRender(progress: number, canvas: fabric.StaticCanvas) {
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

export async function imageOverlayFrameSource({ params, width, height }: FabricFrameSourceOptions<ImageOverlayLayer>) {
  const { path, position, width: relWidth, height: relHeight, zoomDirection, zoomAmount = 0.1 } = params;

  const imgData = await loadImage(path);

  const { left, top, originX, originY } = getPositionProps({ position, width, height });

  const img = new fabric.FabricImage(imgData, {
    originX,
    originY,
    left,
    top,
  });

  async function onRender(progress: number, canvas: fabric.StaticCanvas) {
    const scaleFactor = getZoomParams({ progress, zoomDirection, zoomAmount });

    const translationParams = getTranslationParams({ progress, zoomDirection, zoomAmount });
    img.left = width / 2 + translationParams;

    if (relWidth != null) {
      img.scaleToWidth(relWidth * width * scaleFactor);
    } else if (relHeight != null) {
      img.scaleToHeight(relHeight * height * scaleFactor);
    } else {
      // Default to screen width
      img.scaleToWidth(width * scaleFactor);
    }

    canvas.add(img);
  }

  return { onRender };
}

export async function titleFrameSource({ width, height, params }: FabricFrameSourceOptions<TitleLayer>) {
  const { text, textColor = '#ffffff', fontFamily = defaultFontFamily, position = 'center', zoomDirection = 'in', zoomAmount = 0.2 } = params;

  async function onRender(progress: number, canvas: fabric.StaticCanvas) {
    // console.log('progress', progress);

    const min = Math.min(width, height);

    const fontSize = Math.round(min * 0.1);

    const scaleFactor = getZoomParams({ progress, zoomDirection, zoomAmount });

    const translationParams = getTranslationParams({ progress, zoomDirection, zoomAmount });

    const textBox = new fabric.Textbox(text, {
      fill: textColor,
      fontFamily,
      fontSize,
      textAlign: 'center',
      width: width * 0.8,
    });

    // We need the text as an image in order to scale it
    const textImage = textBox.cloneAsImage({});

    const { left, top, originX, originY } = getPositionProps({ position, width, height });

    textImage.set({
      originX,
      originY,
      left: left + translationParams,
      top,
      scaleX: scaleFactor,
      scaleY: scaleFactor,
    });
    canvas.add(textImage);
  }

  return { onRender };
}

export async function newsTitleFrameSource({ width, height, params }: FabricFrameSourceOptions<NewsTitleLayer>) {
  const { text, textColor = '#ffffff', backgroundColor = '#d02a42', fontFamily = defaultFontFamily, delay = 0, speed = 1 } = params;

  async function onRender(progress: number, canvas: fabric.StaticCanvas) {
    const min = Math.min(width, height);

    const fontSize = Math.round(min * 0.05);

    const easedBgProgress = easeOutExpo(Math.max(0, Math.min((progress - delay) * speed * 3, 1)));
    const easedTextProgress = easeOutExpo(Math.max(0, Math.min((progress - delay - 0.02) * speed * 4, 1)));
    const easedTextOpacityProgress = easeOutExpo(Math.max(0, Math.min((progress - delay - 0.07) * speed * 4, 1)));

    const top = height * 0.08;

    const paddingV = 0.07 * min;
    const paddingH = 0.03 * min;

    const textBox = new fabric.FabricText(text, {
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

async function getFadedObject<T extends fabric.FabricObject>({ object, progress }: { object: T, progress: number }) {
  const rect = new fabric.Rect({
    left: 0,
    width: object.width,
    height: object.height,
    top: 0,
  });

  rect.set('fill', new fabric.Gradient({
    coords: {
      x1: 0,
      y1: 0,
      x2: object.width,
      y2: 0,
    },
    colorStops: [
      { offset: Math.max(0, (progress * (1 + 0.2)) - 0.2), color: 'rgba(255,255,255,1)' },
      { offset: Math.min(1, (progress * (1 + 0.2))), color: 'rgba(255,255,255,0)' },
    ],
  }));

  const gradientMaskImg = rect.cloneAsImage({});
  const fadedImage = object.cloneAsImage({});

  fadedImage.filters.push(new fabric.filters.BlendImage({
    image: gradientMaskImg,
    mode: 'multiply',
  }));

  fadedImage.applyFilters();

  return fadedImage;
}

export async function slideInTextFrameSource({ width, height, params }: FabricFrameSourceOptions<SlideInTextLayer>) {
  const { position, text, fontSize = 0.05, charSpacing = 0.1, textColor = '#ffffff', color = undefined, fontFamily = defaultFontFamily } = params;

  if (color) {
    console.warn('slide-in-text: color is deprecated, use textColor.');
  }

  async function onRender(progress: number, canvas: fabric.StaticCanvas) {
    const fontSizeAbs = Math.round(width * fontSize);

    const { left, top, originX, originY } = getPositionProps({ position, width, height });

    const textBox = new fabric.FabricText(text, {
      fill: color ?? textColor,
      fontFamily,
      fontSize: fontSizeAbs,
      charSpacing: width * charSpacing,
    });

    const { opacity, textSlide } = getFrameByKeyFrames([
      { t: 0.1, props: { opacity: 1, textSlide: 0 } },
      { t: 0.3, props: { opacity: 1, textSlide: 1 } },
      { t: 0.8, props: { opacity: 1, textSlide: 1 } },
      { t: 0.9, props: { opacity: 0, textSlide: 1 } },
    ], progress);

    const fadedObject = await getFadedObject({ object: textBox, progress: easeInOutCubic(textSlide) });
    fadedObject.set({
      originX,
      originY,
      top,
      left,
      opacity,
    });

    canvas.add(fadedObject);
  }

  return { onRender };
}

export async function customFabricFrameSource({ width, height, fabric, params }: FabricFrameSourceOptions<FabricLayer>) {
  return params.func(({ width, height, fabric, params }));
}
