import { createCanvas } from "canvas";
import { defineFrameSource } from "../api/index.js";
import type { CanvasLayer } from "../types.js";
import { canvasToRgba } from "./fabric.js";

export default defineFrameSource<CanvasLayer>("canvas", async ({ width, height, params }) => {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");

  const { onClose, onRender } = await params.func({ width, height, canvas });

  async function readNextFrame(progress: number) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    await onRender(progress);
    // require('fs').writeFileSync(`${new Date().getTime()}.png`, canvas.toBuffer('image/png'));
    // I don't know any way to draw a node-canvas as a layer on a fabric.js canvas, other than converting to rgba first:
    return canvasToRgba(context);
  }

  return {
    readNextFrame,
    // Node canvas needs no cleanup https://github.com/Automattic/node-canvas/issues/1216#issuecomment-412390668
    close: onClose,
  };
});
