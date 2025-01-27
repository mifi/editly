import * as fabric from "fabric/node";
import { defineFrameSource } from "../api/index.js";
import { easeInOutCubic } from "../easings.js";
import type { SlideInTextLayer } from "../types.js";
import { defaultFontFamily, getFrameByKeyFrames, getPositionProps } from "../util.js";

export default defineFrameSource<SlideInTextLayer>(
  "slide-in-text",
  async ({ width, height, params }) => {
    const {
      position,
      text,
      fontSize = 0.05,
      charSpacing = 0.1,
      textColor = "#ffffff",
      color = undefined,
      fontFamily = defaultFontFamily,
    } = params;

    if (color) {
      console.warn("slide-in-text: color is deprecated, use textColor.");
    }

    const fontSizeAbs = Math.round(width * fontSize);

    const { left, top, originX, originY } = getPositionProps({ position, width, height });

    return {
      async readNextFrame(progress, canvas) {
        const textBox = new fabric.FabricText(text, {
          fill: color ?? textColor,
          fontFamily,
          fontSize: fontSizeAbs,
          charSpacing: width * charSpacing,
        });

        const { opacity, textSlide } = getFrameByKeyFrames(
          [
            { t: 0.1, props: { opacity: 1, textSlide: 0 } },
            { t: 0.3, props: { opacity: 1, textSlide: 1 } },
            { t: 0.8, props: { opacity: 1, textSlide: 1 } },
            { t: 0.9, props: { opacity: 0, textSlide: 1 } },
          ],
          progress,
        );

        const fadedObject = await getFadedObject({
          object: textBox,
          progress: easeInOutCubic(textSlide),
        });
        fadedObject.set({
          originX,
          originY,
          top,
          left,
          opacity,
        });

        canvas.add(fadedObject);
      },
    };
  },
);

async function getFadedObject<T extends fabric.FabricObject>({
  object,
  progress,
}: {
  object: T;
  progress: number;
}) {
  const rect = new fabric.Rect({
    left: 0,
    width: object.width,
    height: object.height,
    top: 0,
  });

  rect.set(
    "fill",
    new fabric.Gradient({
      coords: {
        x1: 0,
        y1: 0,
        x2: object.width,
        y2: 0,
      },
      colorStops: [
        { offset: Math.max(0, progress * (1 + 0.2) - 0.2), color: "rgba(255,255,255,1)" },
        { offset: Math.min(1, progress * (1 + 0.2)), color: "rgba(255,255,255,0)" },
      ],
    }),
  );

  const gradientMaskImg = rect.cloneAsImage({});
  const fadedImage = object.cloneAsImage({});

  fadedImage.filters.push(
    new fabric.filters.BlendImage({
      image: gradientMaskImg,
      mode: "multiply",
    }),
  );

  fadedImage.applyFilters();

  return fadedImage;
}
