import * as fabric from "fabric/node";
import { defineFrameSource } from "../api/index.js";
import { getRandomGradient } from "../colors.js";
import type { RadialGradientLayer } from "../types.js";
import { getRekt } from "../util.js";

export default defineFrameSource<RadialGradientLayer>(
  "radial-gradient",
  async ({ width, height, params }) => {
    const { colors: inColors } = params;

    const colors = inColors && inColors.length === 2 ? inColors : getRandomGradient();

    return {
      async readNextFrame(progress, canvas) {
        // console.log('progress', progress);
        const max = Math.max(width, height);

        const r1 = 0;
        const r2 = max * (1 + progress) * 0.6;

        const rect = getRekt(width, height);

        const cx = 0.5 * rect.width;
        const cy = 0.5 * rect.height;

        rect.set(
          "fill",
          new fabric.Gradient({
            type: "radial",
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
          }),
        );

        canvas.add(rect);
      },
    };
  },
);
