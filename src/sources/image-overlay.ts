import * as fabric from "fabric/node";
import { defineFrameSource } from "../api/index.js";
import type { ImageOverlayLayer } from "../types.js";
import { getPositionProps, getTranslationParams, getZoomParams, loadImage } from "../util.js";

export default defineFrameSource<ImageOverlayLayer>(
  "image-overlay",
  async ({ params, width, height }) => {
    const {
      path,
      position,
      width: relWidth,
      height: relHeight,
      zoomDirection,
      zoomAmount = 0.1,
    } = params;

    const imgData = await loadImage(path);

    const img = new fabric.FabricImage(imgData, getPositionProps({ position, width, height }));

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
      },
    };
  },
);
