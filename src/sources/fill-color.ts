import { Rect } from 'fabric/node';
import { getRandomColors } from '../colors.js';
import type { FillColorLayer } from '../types.js';
import { defineFrameSource } from './index.js';

export default defineFrameSource<FillColorLayer>(async ({ params, width, height }) => {
  const { color } = params;

  const randomColor = getRandomColors(1)[0];

  return {
    async readNextFrame(_, canvas) {
      const rect = new Rect({
        left: 0,
        right: 0,
        width,
        height,
        fill: color || randomColor,
      });
      canvas.add(rect);
    }
  };
});