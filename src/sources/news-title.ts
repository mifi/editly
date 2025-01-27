import { FabricText, Rect } from "fabric/node";
import { defineFrameSource } from "../api/index.js";
import { easeOutExpo } from "../easings.js";
import type { NewsTitleLayer } from "../types.js";
import { defaultFontFamily } from "../util.js";

export default defineFrameSource<NewsTitleLayer>(
  "news-title",
  async ({ width, height, params }) => {
    const {
      text,
      textColor = "#ffffff",
      backgroundColor = "#d02a42",
      fontFamily = defaultFontFamily,
      delay = 0,
      speed = 1,
    } = params;
    const min = Math.min(width, height);
    const fontSize = Math.round(min * 0.05);

    return {
      async readNextFrame(progress, canvas) {
        const easedBgProgress = easeOutExpo(
          Math.max(0, Math.min((progress - delay) * speed * 3, 1)),
        );
        const easedTextProgress = easeOutExpo(
          Math.max(0, Math.min((progress - delay - 0.02) * speed * 4, 1)),
        );
        const easedTextOpacityProgress = easeOutExpo(
          Math.max(0, Math.min((progress - delay - 0.07) * speed * 4, 1)),
        );

        const top = height * 0.08;

        const paddingV = 0.07 * min;
        const paddingH = 0.03 * min;

        const textBox = new FabricText(text, {
          top,
          left: paddingV + (easedTextProgress - 1) * width,
          fill: textColor,
          opacity: easedTextOpacityProgress,
          fontFamily,
          fontSize,
          charSpacing: width * 0.1,
        });

        const bgWidth = textBox.width + paddingV * 2;
        const rect = new Rect({
          top: top - paddingH,
          left: (easedBgProgress - 1) * bgWidth,
          width: bgWidth,
          height: textBox.height + paddingH * 2,
          fill: backgroundColor,
        });

        canvas.add(rect);
        canvas.add(textBox);
      },
    };
  },
);
