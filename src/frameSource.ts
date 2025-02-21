import { ImageData } from "canvas";
import { StaticCanvas } from "fabric/node";
import pMap from "p-map";
import type { DebugOptions } from "./configuration.js";
import type { ProcessedClip } from "./parseConfig.js";
import { createLayerSource } from "./sources/index.js";

type FrameSourceOptions = DebugOptions & {
  clip: ProcessedClip;
  clipIndex: number;
  width: number;
  height: number;
  channels: number;
  framerateStr: string;
};

export async function createFrameSource({
  clip,
  clipIndex,
  width,
  height,
  channels,
  verbose,
  logTimes,
  framerateStr,
}: FrameSourceOptions) {
  const { layers, duration } = clip;

  const visualLayers = layers.filter((layer) => layer.type !== "audio");

  const layerFrameSources = await pMap(
    visualLayers,
    async (layer, layerIndex) => {
      if (verbose)
        console.log("createFrameSource", layer.type, "clip", clipIndex, "layer", layerIndex);
      const options = {
        width,
        height,
        duration,
        channels,
        verbose,
        logTimes,
        framerateStr,
        params: layer,
      };
      return createLayerSource(options);
    },
    { concurrency: 1 },
  );

  const canvas = new StaticCanvas(undefined, { width, height });
  const ctx = canvas.getNodeCanvas().getContext("2d");

  async function readNextFrame({ time }: { time: number }) {
    canvas.clear();

    for (const frameSource of layerFrameSources) {
      if (logTimes) console.time("frameSource.readNextFrame");
      const rgba = await frameSource.readNextFrame(time, canvas);
      if (logTimes) console.timeEnd("frameSource.readNextFrame");

      // Frame sources can either render to the provided canvas and return nothing
      // OR return an raw RGBA blob which will be drawn onto the canvas
      if (rgba) {
        // Optimization: Don't need to draw to canvas if there's only one layer
        if (layerFrameSources.length === 1) return rgba;

        if (logTimes) console.time("putImageData");
        ctx.putImageData(new ImageData(Uint8ClampedArray.from(rgba), width, height), 0, 0);
        if (logTimes) console.timeEnd("putImageData");
      } else {
        // Assume this frame source has drawn its content to the canvas, go ahead and render it
        canvas.renderAll();
      }
    }

    return ctx.getImageData(0, 0, width, height).data;
  }

  async function close() {
    await pMap(layerFrameSources, (frameSource) => frameSource.close?.());
    await canvas.dispose();
  }

  return {
    readNextFrame,
    close,
  };
}

export default {
  createFrameSource,
};
