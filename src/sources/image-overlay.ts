import * as fabric from 'fabric/node';
import type { ImageOverlayLayer } from '../types.js';
import { loadImage, getPositionProps } from '../util.js';
import { getZoomParams, getTranslationParams } from './fabricFrameSources.js';
import { defineFrameSource } from './index.js';

export default defineFrameSource<ImageOverlayLayer>(async ({ params, width, height }) => {
  const { path, position, width: relWidth, height: relHeight, zoomDirection, zoomAmount = 0.1 } = params;

  const imgData = await loadImage(path);

  const { left, top, originX, originY } = getPositionProps({ position, width, height });

  const img = new fabric.FabricImage(imgData, {
    originX,
    originY,
    left,
    top,
  });

  return {
    async readNextFrame(progress, canvas) {
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
  };
});
