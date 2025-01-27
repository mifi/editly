import { FabricImage } from "fabric/node";
import { defineFrameSource } from "../api/index.js";
import type { ImageLayer } from "../types.js";
import { getTranslationParams, getZoomParams, loadImage } from "../util.js";
import { blurImage } from "./fabric.js";

export default defineFrameSource<ImageLayer>(
  "image",
  async ({ verbose, params, width, height }) => {
    const { path, zoomDirection = "in", zoomAmount = 0.1, resizeMode = "contain-blur" } = params;

    if (verbose) console.log("Loading", path);

    const imgData = await loadImage(path);

    const createImg = () =>
      new FabricImage(imgData, {
        originX: "center",
        originY: "center",
        left: width / 2,
        top: height / 2,
      });

    let blurredImg: FabricImage;
    // Blurred version
    if (resizeMode === "contain-blur") {
      // If we dispose mutableImg, seems to cause issues with the rendering of blurredImg
      const mutableImg = createImg();
      if (verbose) console.log("Blurring background");
      blurredImg = await blurImage({ mutableImg, width, height });
    }

    return {
      async readNextFrame(progress, canvas) {
        const img = createImg();

        const scaleFactor = getZoomParams({ progress, zoomDirection, zoomAmount });
        const translationParams = getTranslationParams({ progress, zoomDirection, zoomAmount });

        const ratioW = width / img.width;
        const ratioH = height / img.height;

        img.left = width / 2 + translationParams;

        if (["contain", "contain-blur"].includes(resizeMode)) {
          if (ratioW > ratioH) {
            img.scaleToHeight(height * scaleFactor);
          } else {
            img.scaleToWidth(width * scaleFactor);
          }
        } else if (resizeMode === "cover") {
          if (ratioW > ratioH) {
            img.scaleToWidth(width * scaleFactor);
          } else {
            img.scaleToHeight(height * scaleFactor);
          }
        } else if (resizeMode === "stretch") {
          img.set({
            scaleX: (width / img.width) * scaleFactor,
            scaleY: (height / img.height) * scaleFactor,
          });
        }

        if (blurredImg) canvas.add(blurredImg);
        canvas.add(img);
      },

      close() {
        if (blurredImg) blurredImg.dispose();
        // imgData.dispose();
      },
    };
  },
);
