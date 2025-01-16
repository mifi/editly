import * as fabric from 'fabric/node';

import { easeInOutCubic } from '../transitions.js';
import { getFrameByKeyFrames, getPositionProps } from '../util.js';
import { type FabricFrameSourceOptions } from './fabric.js';
import type { FabricLayer, KenBurns, SlideInTextLayer } from '../types.js';

// http://fabricjs.com/kitchensink

export const defaultFontFamily = 'sans-serif';

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

export function getRekt(width: number, height: number) {
  // width and height with room to rotate
  return new fabric.Rect({ originX: 'center', originY: 'center', left: width / 2, top: height / 2, width: width * 2, height: height * 2 });
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
