import * as fabric from 'fabric/node';

import { type FabricFrameSourceOptions } from './fabric.js';
import type { FabricLayer, KenBurns } from '../types.js';

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

export async function customFabricFrameSource({ width, height, fabric, params }: FabricFrameSourceOptions<FabricLayer>) {
  return params.func(({ width, height, fabric, params }));
}
