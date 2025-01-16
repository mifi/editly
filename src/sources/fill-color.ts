import * as fabric from 'fabric/node';
import { getRandomColors } from '../colors.js';
import type { CreateFrameSourceOptions, FillColorLayer, FrameSource } from '../types.js';

export default async function fillColorFrameSource({ params, width, height }: CreateFrameSourceOptions<FillColorLayer>): Promise<FrameSource> {
  const { color } = params;

  const randomColor = getRandomColors(1)[0];

  return {
    async readNextFrame(_: number, canvas: fabric.StaticCanvas) {
      const rect = new fabric.Rect({
        left: 0,
        right: 0,
        width,
        height,
        fill: color || randomColor,
      });
      canvas.add(rect);
    }
  };
}
